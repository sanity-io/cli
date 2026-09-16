import {basename, dirname} from 'node:path'
import {createGzip} from 'node:zlib'

import {type AppVisibility, type CliConfig} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {c as createTar} from 'tar'

import {type DerivedInterface, deriveInterfaces} from '../../deriveInterfaces.js'
import {
  type Application,
  type BrettAccess,
  type BrettInterface,
  type BrettWorkspace,
  createApplication,
  createDeployment,
  deleteApplication,
  updateApplication,
} from '../../services/applications.js'

/**
 * `rollback` undoes the creation, so a later failure leaves no record stranded at the slug.
 * @internal
 */
export interface CreatedApplication {
  application: Application
  rollback: () => Promise<void>
}

function toBrettInterface(iface: DerivedInterface, version: string): BrettInterface {
  const {id: _id, src: _src, ...declaration} = iface
  if ('type' in declaration) return {...declaration, version}

  switch (declaration.surface) {
    case 'asset_source': {
      const {surface, ...view} = declaration
      return {...view, type: surface, version}
    }
    case 'panel': {
      const {surface, ...view} = declaration
      return {...view, type: surface, version}
    }
    case 'tile': {
      const {surface, ...view} = declaration
      return {...view, type: surface, version}
    }
    case 'window': {
      const {surface, ...view} = declaration
      return {...view, type: 'app', version}
    }
  }
}

/**
 * Create a coreApp record (no deployment), so the CLI can build with its id
 * before shipping the first deployment. First deploy only.
 * @internal
 */
export async function createCoreApp(options: {
  isSingleton?: boolean
  name?: string
  organizationId: string
  slug: string
  title: string
  visibility?: AppVisibility
}): Promise<CreatedApplication> {
  const spin = spinner('Creating application...').start()
  try {
    const application = await createApplication({...options, type: 'coreApp'})
    spin.succeed()
    return {application, rollback: () => deleteApplication(application.id)}
  } catch (error) {
    spin.fail()
    throw error
  }
}

/**
 * Create a studio record (no deployment).
 * @internal
 */
export async function createStudio(options: {
  name?: string
  organizationId: string
  projectId: string | undefined
  slug: string
  title: string
  visibility?: AppVisibility
}): Promise<CreatedApplication> {
  const spin = spinner('Creating studio...').start()
  try {
    const application = await createApplication({...options, type: 'studio'})
    spin.succeed()
    return {application, rollback: () => deleteApplication(application.id)}
  } catch (error) {
    spin.fail()
    throw error
  }
}

/**
 * Ship a deployment to an already-created (or `deployment.appId`) application,
 * then sync its mutable metadata (`title`, and `icon`/`slug`/`visibility` when
 * set) from config. The deploy endpoint ignores these, so a redeploy patches
 * them here alongside the new deployment.
 *
 * `onDeployed` fires the instant the deployment is live, before the metadata
 * sync — so a caller can disarm a create-time rollback that must not delete an
 * application once it has an active deployment.
 * @internal
 */
export async function deployWorkbenchApp(options: {
  access?: readonly BrettAccess[]
  app: CliConfig['app']
  applicationId: string
  icon?: string
  isApp: boolean
  isAutoUpdating: boolean
  label?: string
  onDeployed?: () => void
  /**
   * The address from config. Only `createApplication` used to send it, so an
   * app with a `deployment.appId` kept whatever slug it was created at.
   */
  slug?: string
  sourceDir: string
  title: string
  version: string
  visibility?: AppVisibility
  workspaces?: readonly BrettWorkspace[]
}): Promise<void> {
  const {
    access,
    app,
    applicationId,
    icon,
    isApp,
    isAutoUpdating,
    label = 'Deploying...',
    onDeployed,
    slug,
    sourceDir,
    title,
    version,
    visibility,
    workspaces,
  } = options
  const tarball = createTar({cwd: dirname(sourceDir)}, [basename(sourceDir)]).pipe(createGzip())

  const spin = spinner(label).start()
  try {
    await createDeployment({
      access,
      applicationId,
      // Brett assigns the id and resolves modules by `moduleId`, so neither travels.
      interfaces: deriveInterfaces(app, {appTitle: title, isApp}).map((iface) =>
        toBrettInterface(iface, version),
      ),
      isAutoUpdating,
      tarball,
      version,
      workspaces,
    })
    onDeployed?.()
    try {
      await updateApplication(applicationId, {
        title,
        ...(icon ? {icon} : {}),
        ...(slug ? {slug} : {}),
        ...(visibility ? {visibility} : {}),
      })
    } catch (error) {
      throw toSlugRejection(error, slug)
    }
    spin.succeed()
  } catch (error) {
    spin.clear()
    throw error
  }
}

/**
 * The slug is the one synced field the server validates — it must be free
 * within the organization, and a singleton app only accepts its reserved
 * identifiers — so a 4xx on the metadata patch is a rejected rename. Name the
 * slug and the server's reason; anything else propagates untouched.
 */
function toSlugRejection(error: unknown, slug: string | undefined): unknown {
  const statusCode = (error as {statusCode?: number})?.statusCode
  if (!slug || statusCode === undefined || statusCode < 400 || statusCode >= 500) return error
  return new Error(
    `Slug "${slug}" was rejected: ${getErrorMessage(error)}. The deployment is live at the application's previous slug — change \`app.slug\` in sanity.cli.ts and deploy again.`,
    {cause: error},
  )
}

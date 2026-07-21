import {basename, dirname} from 'node:path'
import {createGzip} from 'node:zlib'

import {type AppVisibility} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {pack} from 'tar-fs'

import {
  type BrettInterface,
  type BrettWorkspace,
  createApplication,
  createDeployment,
  deleteApplication,
  updateApplication,
} from '../../services/applications.js'

/**
 * A freshly created application record: its id, plus a way to undo the creation.
 * The caller builds and deploys with the id, and calls `rollback` if a later
 * step fails so the record isn't stranded at its slug.
 * @internal
 */
export interface CreatedApplication {
  applicationId: string
  rollback: () => Promise<void>
}

/**
 * Create a coreApp record (no deployment), so the CLI can build with its id
 * before shipping the first deployment. First deploy only.
 * @internal
 */
export async function createCoreApp(options: {
  isSingleton?: boolean
  organizationId: string
  slug: string
  title: string
  visibility?: AppVisibility
}): Promise<CreatedApplication> {
  const spin = spinner('Creating application...').start()
  try {
    const {id} = await createApplication({...options, type: 'coreApp'})
    spin.succeed()
    return {applicationId: id, rollback: () => deleteApplication(id)}
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
  organizationId: string
  projectId: string | undefined
  slug: string
  title: string
}): Promise<CreatedApplication> {
  const spin = spinner('Creating studio...').start()
  try {
    const {id} = await createApplication({...options, type: 'studio'})
    spin.succeed()
    return {applicationId: id, rollback: () => deleteApplication(id)}
  } catch (error) {
    spin.fail()
    throw error
  }
}

/**
 * Ship a deployment to an already-created (or `deployment.appId`) application,
 * then sync its mutable metadata (`title`, and `icon`/`visibility` when set)
 * from config. The deploy endpoint ignores these, so a redeploy patches them
 * here alongside the new deployment.
 * @internal
 */
export async function deployWorkbenchApp(options: {
  applicationId: string
  icon?: string
  interfaces: readonly BrettInterface[]
  isAutoUpdating: boolean
  label?: string
  sourceDir: string
  title: string
  version: string
  visibility?: AppVisibility
  workspaces?: readonly BrettWorkspace[]
}): Promise<void> {
  const {
    applicationId,
    icon,
    interfaces,
    isAutoUpdating,
    label = 'Deploying...',
    sourceDir,
    title,
    version,
    visibility,
    workspaces,
  } = options
  const tarball = pack(dirname(sourceDir), {entries: [basename(sourceDir)]}).pipe(createGzip())

  const spin = spinner(label).start()
  try {
    await createDeployment({
      applicationId,
      interfaces,
      isAutoUpdating,
      tarball,
      version,
      workspaces,
    })
    await updateApplication(applicationId, {
      title,
      ...(icon ? {icon} : {}),
      ...(visibility ? {visibility} : {}),
    })
    spin.succeed()
  } catch (error) {
    spin.clear()
    throw error
  }
}

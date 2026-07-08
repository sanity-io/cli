// Deploys a plain (non-workbench) SDK application through the
// user-applications service, creating the application when none is configured.

import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip} from 'node:zlib'

import {spinner} from '@sanity/cli-core/ux'
import {pack} from 'tar-fs'

import {
  createDeployment,
  updateUserApplication,
  type UserApplication,
  type UserApplicationResolved,
} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {extractCoreAppManifest, resolveTitleUpdate} from '../manifest/extractCoreAppManifest.js'
import {type CoreAppManifest} from '../manifest/types.js'
import {
  checkAppBuild,
  checkAppIdConfig,
  checkAppTarget,
  checkAutoUpdates,
  checkOrganizationId,
  checkOutputDir,
  checkPackageVersion,
  type DeployCheck,
  enforce,
  externalAppNotSupported,
} from './checks.js'
import {createUserApplication} from './createUserApplication.js'
import {deployDebug} from './deployDebug.js'
import {findUserApplication} from './findUserApplication.js'
import {
  type DeployAdapter,
  type DeploymentPlan,
  type DeployResult,
  isDeployable,
  listDeploymentFiles,
  newPlan,
} from './runDeploy.js'
import {type DeployAppOptions} from './types.js'
import {getCoreAppUrl} from './urlUtils.js'

const APP_PACKAGE = '@sanity/sdk-react'

export const coreAppAdapter: DeployAdapter<'coreApp'> = {
  deploy,
  plan,
  type: 'coreApp',
}

async function plan(options: DeployAppOptions): Promise<DeploymentPlan<'coreApp'>> {
  const {cliConfig, flags, projectRoot, sourceDir} = options
  const workDir = projectRoot.directory
  const organizationId = cliConfig.app?.organizationId
  const checks: DeployCheck[] = []

  const autoUpdates = checkAutoUpdates({cliConfig, flags})
  checks.push(...autoUpdates.checks)

  const pkg = await checkPackageVersion({moduleName: APP_PACKAGE, workDir})
  checks.push(pkg.check, checkOrganizationId(organizationId))

  const appIdConfig = checkAppIdConfig(cliConfig)
  if (appIdConfig) checks.push(appIdConfig)

  let target = null
  if (flags.external) {
    checks.push(externalAppNotSupported)
  } else {
    const resolved = await checkAppTarget({
      appId: getAppId(cliConfig),
      organizationId,
      title: appTitle(options),
    })
    checks.push(resolved.check)
    target = resolved.target
  }

  checks.push(await checkAppBuild(options, {autoUpdatesEnabled: autoUpdates.enabled}))

  const outputDir = await checkOutputDir({isWorkbenchApp: false, sourceDir})
  if (outputDir) checks.push(outputDir)

  const result = newPlan({checks, target, type: 'coreApp', version: pkg.version})
  if (isDeployable(result)) {
    result.files = await listDeploymentFiles(sourceDir, workDir)
  }
  return result
}

async function deploy(options: DeployAppOptions): Promise<DeployResult<'coreApp'> | undefined> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options
  const workDir = projectRoot.directory
  const organizationId = cliConfig.app?.organizationId

  const autoUpdates = checkAutoUpdates({cliConfig, flags})
  for (const check of autoUpdates.checks) enforce(output, check)

  const pkg = await checkPackageVersion({moduleName: APP_PACKAGE, workDir})
  enforce(output, pkg.check)
  if (!pkg.version) return

  enforce(output, checkOrganizationId(organizationId))

  const appIdConfig = checkAppIdConfig(cliConfig)
  if (appIdConfig) enforce(output, appIdConfig)

  if (flags.external) enforce(output, externalAppNotSupported)

  const application = await resolveApplication(options)
  if (!application) return

  enforce(output, await checkAppBuild(options, {autoUpdatesEnabled: autoUpdates.enabled}))

  const outputDir = await checkOutputDir({isWorkbenchApp: false, sourceDir})
  if (outputDir) enforce(output, outputDir)

  // Manifests aren't strictly essential, so a failure warns and continues
  let manifest: CoreAppManifest | undefined
  try {
    manifest = await extractCoreAppManifest({workDir})
  } catch (err) {
    deployDebug('Error extracting app manifest', err)
    output.warn(`Error extracting app manifest: ${getErrorMessage(err)}`)
  }

  const titled = await syncApplicationTitle({application, manifest, output})
  await ship({
    application: titled,
    isAutoUpdating: autoUpdates.enabled,
    manifest,
    sourceDir,
    version: pkg.version,
  })
  logAppDeployed({
    applicationId: titled.id,
    cliConfig,
    organizationId: titled.organizationId,
    output,
    title: titled.title,
  })

  return {
    applicationType: 'coreApp',
    applicationVersion: pkg.version,
    target: {
      applicationId: titled.id,
      title: titled.title ?? null,
      url: getCoreAppUrl(titled.organizationId, titled.id),
    },
  }
}

function appTitle({cliConfig, flags}: DeployAppOptions): string | undefined {
  return flags.title?.trim() || cliConfig.app?.title?.trim() || undefined
}

/** Finds the application the deploy targets, creating one when none is configured. */
async function resolveApplication(
  options: DeployAppOptions,
): Promise<UserApplicationResolved | null> {
  const {cliConfig, flags, output} = options
  const organizationId = cliConfig.app?.organizationId ?? ''
  const title = appTitle(options)

  let application = await findUserApplication({
    cliConfig,
    organizationId,
    output,
    title,
    unattended: !!flags.yes,
  })
  deployDebug('User application found', application)

  if (!application) {
    deployDebug('No user application found. Creating a new one')
    application = await createUserApplication(organizationId, title)
    deployDebug('User application created', application)
  }

  return application
}

/** Syncs the application title from the manifest when it has changed. */
async function syncApplicationTitle({
  application,
  manifest,
  output,
}: {
  application: UserApplicationResolved
  manifest: CoreAppManifest | undefined
  output: DeployAppOptions['output']
}): Promise<UserApplicationResolved> {
  const titleUpdate = resolveTitleUpdate(manifest, application)
  if (!titleUpdate) return application

  deployDebug('Updating application title from manifest', titleUpdate)
  output.log(
    titleUpdate.from
      ? `Updating title from "${titleUpdate.from}" to "${titleUpdate.to}"`
      : `Setting application title to "${titleUpdate.to}"`,
  )
  const spin = spinner('Updating application title').start()
  try {
    const updated = await updateUserApplication({
      applicationId: application.id,
      appType: 'coreApp',
      body: {title: titleUpdate.to},
    })
    spin.succeed()
    return updated
  } catch (err) {
    spin.fail()
    const message = getErrorMessage(err)
    deployDebug('Error updating application title', {message})
    output.warn(`Error updating application title: ${message}`)
    return application
  }
}

async function ship({
  application,
  isAutoUpdating,
  manifest,
  sourceDir,
  version,
}: {
  application: UserApplication
  isAutoUpdating: boolean
  manifest: CoreAppManifest | undefined
  sourceDir: string
  version: string
}): Promise<void> {
  const tarball = pack(dirname(sourceDir), {entries: [basename(sourceDir)]}).pipe(createGzip())

  const spin = spinner('Deploying...').start()
  try {
    await createDeployment({
      applicationId: application.id,
      isApp: true,
      isAutoUpdating,
      manifest,
      tarball,
      version,
    })
  } catch (error) {
    spin.clear()
    throw error
  }
  spin.succeed()
}

export function logAppDeployed({
  applicationId,
  cliConfig,
  organizationId,
  output,
  title,
}: {
  applicationId: string
  cliConfig: DeployAppOptions['cliConfig']
  organizationId: string
  output: DeployAppOptions['output']
  title: string | null
}): void {
  const url = getCoreAppUrl(organizationId, applicationId)
  const named = title ? ` — "${title}"` : ''
  output.log(`\nSuccess! Application deployed to ${styleText('cyan', url)}${named}`)

  if (getAppId(cliConfig)) return

  output.log(`\n════ ${styleText('bold', 'Next step:')} ════`)
  output.log(
    styleText('bold', '\nAdd the deployment.appId to your sanity.cli.js or sanity.cli.ts file:'),
  )
  output.log(`
${styleText(
  'dim',
  `app: {
  // your application config here…
}`,
)},
${styleText(
  ['bold', 'green'],
  `deployment: {
  appId: '${applicationId}',
}\n`,
)}`)
}

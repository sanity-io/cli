// Deploys a plain (non-workbench) SDK application through the
// user-applications service, creating the application when none is configured.

import {basename, dirname} from 'node:path'
import {styleText} from 'node:util'
import {createGzip} from 'node:zlib'

import {getErrorMessage} from '@sanity/cli-core'
import {
  checkOrganizationId,
  type DeployAdapter,
  type DeployAppOptions,
  type DeployCheck,
  type DeployResult,
  type DeployState,
  getCoreAppUrl,
  type TargetCheck,
} from '@sanity/cli-core/deploy'
import {spinner} from '@sanity/cli-core/ux'
import {pack} from 'tar-fs'

import {
  createDeployment,
  updateUserApplication,
  type UserApplication,
  type UserApplicationResolved,
} from '../../services/userApplications.js'
import {getAppId} from '../../util/appId.js'
import {extractCoreAppManifest, resolveTitleUpdate} from '../manifest/extractCoreAppManifest.js'
import {type CoreAppManifest} from '../manifest/types.js'
import {
  checkAppBuild,
  checkAppIdConfig,
  checkAppTarget,
  checkAutoUpdates,
  checkOutputDir,
  checkPackageVersion,
  externalAppNotSupported,
} from './checks.js'
import {createUserApplication} from './createUserApplication.js'
import {deployDebug} from './deployDebug.js'
import {findUserApplication} from './findUserApplication.js'

const APP_PACKAGE = '@sanity/sdk-react'

interface CoreAppState extends DeployState {
  application: UserApplicationResolved | null
  autoUpdatesEnabled: boolean
}

export const coreAppAdapter: DeployAdapter<'coreApp', CoreAppState> = {
  acquireTarget,
  check,
  checkOutput,
  deploy,
  describeTarget,
  type: 'coreApp',
}

async function check(
  options: DeployAppOptions,
): Promise<{checks: DeployCheck[]; state: CoreAppState}> {
  const {cliConfig, flags, projectRoot} = options
  const checks: DeployCheck[] = []

  const autoUpdates = checkAutoUpdates({cliConfig, flags})
  checks.push(...autoUpdates.checks)

  const pkg = await checkPackageVersion({moduleName: APP_PACKAGE, workDir: projectRoot.directory})
  checks.push(pkg.check, checkOrganizationId(cliConfig.app?.organizationId))

  const appIdConfig = checkAppIdConfig(cliConfig)
  if (appIdConfig) checks.push(appIdConfig)

  if (flags.external) checks.push(externalAppNotSupported)

  return {
    checks,
    state: {application: null, autoUpdatesEnabled: autoUpdates.enabled, version: pkg.version},
  }
}

function describeTarget(options: DeployAppOptions): Promise<TargetCheck | null> {
  const {cliConfig, flags} = options
  // The --external fail already reported; there is no target to describe.
  if (flags.external) return Promise.resolve(null)
  return checkAppTarget({
    appId: getAppId(cliConfig),
    organizationId: cliConfig.app?.organizationId,
    title: appTitle(options),
  })
}

/** Finds the application the deploy targets, creating one when none is configured. */
async function acquireTarget(
  options: DeployAppOptions,
  state: CoreAppState,
): Promise<CoreAppState> {
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

  return {...state, application}
}

async function checkOutput(
  options: DeployAppOptions,
  state: CoreAppState,
): Promise<{checks: DeployCheck[]; state: CoreAppState}> {
  const checks: DeployCheck[] = [
    await checkAppBuild(options, {autoUpdatesEnabled: state.autoUpdatesEnabled}),
  ]

  const outputDir = await checkOutputDir(options.sourceDir)
  if (outputDir) checks.push(outputDir)

  return {checks, state}
}

async function deploy(
  options: DeployAppOptions,
  state: CoreAppState,
): Promise<DeployResult<'coreApp'> | undefined> {
  const {cliConfig, output, projectRoot, sourceDir} = options
  const {application, version} = state
  if (!application || !version) return

  // Manifests aren't strictly essential, so a failure warns and continues
  let manifest: CoreAppManifest | undefined
  try {
    manifest = await extractCoreAppManifest({workDir: projectRoot.directory})
  } catch (err) {
    deployDebug('Error extracting app manifest', err)
    output.warn(`Error extracting app manifest: ${getErrorMessage(err)}`)
  }

  const titled = await syncApplicationTitle({application, manifest, output})
  await ship({
    application: titled,
    isAutoUpdating: state.autoUpdatesEnabled,
    manifest,
    sourceDir,
    version,
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
    applicationVersion: version,
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

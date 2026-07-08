// The workbench adapters: federated apps and studios follow the same deploy
// procedure as their plain counterparts but ship through the applications API
// (Brett) and register their exposed views/services. A media-library singleton
// additionally (or only, when it exposes nothing) persists its installation
// config to the organization.

import {styleText} from 'node:util'

import {type CliConfig, exitCodes} from '@sanity/cli-core'
import {
  buildExposes,
  deployCoreApp,
  type DeployedExpose,
  deployInstallationConfig,
  deployStudio,
  getWorkbench,
  resolveInstallationId,
  summarizeExposes,
  summarizeInstallationConfig,
} from '@sanity/workbench-cli/deploy'

import {getAppId} from '../../util/appId.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {
  checkAppBuild,
  checkAppIdConfig,
  checkAppTarget,
  checkAutoUpdates,
  checkOrganizationId,
  checkOutputDir,
  checkPackageVersion,
  checkProjectId,
  checkStudioBuild,
  checkStudioTarget,
  type DeployCheck,
  enforce,
  externalAppNotSupported,
} from './checks.js'
import {logAppDeployed} from './coreApp.js'
import {generateAppSlug} from './createUserApplication.js'
import {uploadStudioSchema} from './deployStudioSchemasAndManifests.js'
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

type Workbench = NonNullable<ReturnType<typeof getWorkbench>>

const externalStudioNotSupported: DeployCheck = {
  exitCode: exitCodes.USAGE_ERROR,
  message: 'Deploying a federated application to an external host is not yet supported',
  solution: 'Remove the --external flag to deploy to Sanity hosting',
  status: 'fail',
}

export const workbenchAppAdapter: DeployAdapter<'coreApp'> = {
  deploy: deployWorkbenchApp,
  plan: planWorkbenchApp,
  type: 'coreApp',
}

export const workbenchStudioAdapter: DeployAdapter<'studio'> = {
  deploy: deployWorkbenchStudio,
  plan: planWorkbenchStudio,
  type: 'studio',
}

async function planWorkbenchApp(options: DeployAppOptions): Promise<DeploymentPlan<'coreApp'>> {
  const {cliConfig, flags, projectRoot, sourceDir} = options
  const workDir = projectRoot.directory
  const workbench = requireWorkbench(cliConfig)
  const organizationId = cliConfig.app?.organizationId
  const checks: DeployCheck[] = []

  const deployable = checkDeployable(workbench)
  if (deployable) checks.push(deployable)

  const autoUpdates = checkAutoUpdates({cliConfig, flags})
  checks.push(...autoUpdates.checks)

  const pkg = await checkAppVersion(workbench, workDir)
  if (pkg) checks.push(pkg.check)

  checks.push(checkOrganizationId(organizationId))

  const appIdConfig = checkAppIdConfig(cliConfig)
  if (appIdConfig) checks.push(appIdConfig)

  let target = null
  if (flags.external) {
    checks.push(externalAppNotSupported)
  } else if (workbench.hasInterfaces) {
    const resolved = await checkAppTarget({
      appId: getAppId(cliConfig),
      isWorkbenchApp: true,
      title: appTitle(options, workbench),
    })
    checks.push(resolved.check)
    target = resolved.target
  }

  checks.push(await checkAppBuild(options, {autoUpdatesEnabled: autoUpdates.enabled}))

  const outputDir = await checkOutputDir({isWorkbenchApp: true, sourceDir})
  if (outputDir) checks.push(outputDir)

  let installationConfig: string | null = null
  const installation = installationConfigOf(workbench, organizationId)
  if (installation && organizationId) {
    const config = await checkInstallationConfig(installation, organizationId)
    checks.push(config.check)
    if (config.installationId) installationConfig = config.installationConfig
  }

  let exposes: DeployedExpose[] = []
  if (workbench.hasInterfaces) {
    const exposeReport = exposeChecks(workbench)
    checks.push(...exposeReport.checks)
    exposes = exposeReport.exposes
  }

  const plan = newPlan({
    checks,
    exposes,
    installationConfig,
    target,
    type: 'coreApp',
    version: pkg?.version ?? null,
  })
  if (isDeployable(plan)) {
    plan.files = await listDeploymentFiles(sourceDir, workDir)
  }
  return plan
}

async function deployWorkbenchApp(
  options: DeployAppOptions,
): Promise<DeployResult<'coreApp'> | undefined> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options
  const workDir = projectRoot.directory
  const workbench = requireWorkbench(cliConfig)
  const organizationId = cliConfig.app?.organizationId
  const title = appTitle(options, workbench)

  const deployable = checkDeployable(workbench)
  if (deployable) enforce(output, deployable)

  const autoUpdates = checkAutoUpdates({cliConfig, flags})
  for (const check of autoUpdates.checks) enforce(output, check)

  const pkg = await checkAppVersion(workbench, workDir)
  if (pkg) enforce(output, pkg.check)
  const version = pkg?.version
  if (!version) return

  enforce(output, checkOrganizationId(organizationId))
  if (!organizationId) return

  const appIdConfig = checkAppIdConfig(cliConfig)
  if (appIdConfig) enforce(output, appIdConfig)

  if (flags.external) enforce(output, externalAppNotSupported)

  // Rejects a bad appId before the build rather than at the POST.
  if (workbench.hasInterfaces) {
    const resolved = await checkAppTarget({
      appId: getAppId(cliConfig),
      isWorkbenchApp: true,
      title,
    })
    enforce(output, resolved.check)
  }

  enforce(output, await checkAppBuild(options, {autoUpdatesEnabled: autoUpdates.enabled}))

  const outputDir = await checkOutputDir({isWorkbenchApp: true, sourceDir})
  if (outputDir) enforce(output, outputDir)

  const installation = installationConfigOf(workbench, organizationId)
  const config = installation ? await checkInstallationConfig(installation, organizationId) : null
  if (installation && config) {
    enforce(output, config.check)
    if (!config.installationId) return
    await deployInstallationConfig({
      appType: installation.appType,
      installationId: config.installationId,
      output,
      sourceDir,
      version,
    })
  }

  // A config-only singleton ships no application, only its installation config.
  if (!workbench.hasInterfaces) {
    if (!config?.installationId) return
    return {
      applicationType: 'coreApp',
      applicationVersion: version,
      ...(config.installationConfig ? {installationConfig: config.installationConfig} : {}),
      installationId: config.installationId,
      target: null,
    }
  }

  const {exposes} = summarizeExposes(workbench)
  const {applicationId} = await deployCoreApp({
    appId: getAppId(cliConfig),
    interfaces: buildExposes(workbench, {
      appName: workbench.name,
      appTitle: title,
      exposesAppView: workbench.entry !== undefined,
      version,
    }),
    isAutoUpdating: autoUpdates.enabled,
    organizationId,
    slug: generateAppSlug(),
    sourceDir,
    title,
    version,
  })
  logAppDeployed({applicationId, cliConfig, organizationId, output, title})

  return {
    applicationType: 'coreApp',
    applicationVersion: version,
    ...(exposes.length > 0 ? {exposes} : {}),
    target: {applicationId, title, url: getCoreAppUrl(organizationId, applicationId)},
  }
}

async function planWorkbenchStudio(options: DeployAppOptions): Promise<DeploymentPlan<'studio'>> {
  const {cliConfig, flags, projectRoot, sourceDir} = options
  const workDir = projectRoot.directory
  const workbench = requireWorkbench(cliConfig)
  const isExternal = !!flags.external
  const checks: DeployCheck[] = []

  if (isExternal) checks.push(externalStudioNotSupported)

  const autoUpdates = checkAutoUpdates({cliConfig, flags})
  checks.push(...autoUpdates.checks)

  const pkg = await checkPackageVersion({moduleName: 'sanity', workDir})
  checks.push(
    pkg.check,
    checkProjectId(cliConfig.api?.projectId),
    checkOrganizationId(cliConfig.app?.organizationId),
  )

  let target = null
  if (!isExternal) {
    const resolved = await checkStudioTarget({
      appId: getAppId(cliConfig),
      isWorkbenchApp: true,
      studioHost: cliConfig.studioHost,
      title: appTitle(options, workbench),
    })
    checks.push(resolved.check)
    target = resolved.target
  }

  checks.push(
    await checkStudioBuild(options, {autoUpdatesEnabled: autoUpdates.enabled, isExternal}),
  )

  if (!isExternal) {
    const outputDir = await checkOutputDir({isWorkbenchApp: true, sourceDir})
    if (outputDir) checks.push(outputDir)
  }

  let exposes: DeployedExpose[] = []
  if (!isExternal) {
    const exposeReport = exposeChecks(workbench)
    checks.push(...exposeReport.checks)
    exposes = exposeReport.exposes
  }

  const plan = newPlan({checks, exposes, target, type: 'studio', version: pkg.version})
  if (!isExternal && isDeployable(plan)) {
    plan.files = await listDeploymentFiles(sourceDir, workDir)
  }
  return plan
}

async function deployWorkbenchStudio(
  options: DeployAppOptions,
): Promise<DeployResult<'studio'> | undefined> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options
  const workDir = projectRoot.directory
  const workbench = requireWorkbench(cliConfig)
  const organizationId = cliConfig.app?.organizationId
  const title = appTitle(options, workbench)

  if (flags.external) enforce(output, externalStudioNotSupported)

  const autoUpdates = checkAutoUpdates({cliConfig, flags})
  for (const check of autoUpdates.checks) enforce(output, check)

  const pkg = await checkPackageVersion({moduleName: 'sanity', workDir})
  enforce(output, pkg.check)
  if (!pkg.version) return

  enforce(output, checkProjectId(cliConfig.api?.projectId))
  enforce(output, checkOrganizationId(organizationId))
  if (!organizationId) return

  // Rejects a bad appId before the build; the resolved URL feeds the deploy result.
  const resolved = await checkStudioTarget({
    appId: getAppId(cliConfig),
    isWorkbenchApp: true,
    studioHost: cliConfig.studioHost,
    title,
  })
  enforce(output, resolved.check)

  enforce(
    output,
    await checkStudioBuild(options, {autoUpdatesEnabled: autoUpdates.enabled, isExternal: false}),
  )

  const outputDir = await checkOutputDir({isWorkbenchApp: true, sourceDir})
  if (outputDir) enforce(output, outputDir)

  await uploadStudioSchema(options, {isExternal: false})

  const {exposes} = summarizeExposes(workbench)
  const {applicationId} = await deployStudio({
    appId: getAppId(cliConfig),
    interfaces: buildExposes(workbench, {
      appName: workbench.name,
      appTitle: title,
      exposesAppView: true,
      version: pkg.version,
    }),
    isAutoUpdating: autoUpdates.enabled,
    organizationId,
    output,
    projectId: cliConfig.api?.projectId,
    sourceDir,
    studioHost: cliConfig.studioHost,
    title,
    version: pkg.version,
  })
  logStudioDeployed({applicationId, cliConfig, output})

  return {
    applicationType: 'studio',
    applicationVersion: pkg.version,
    ...(exposes.length > 0 ? {exposes} : {}),
    target: {applicationId, title, url: resolved.target?.url ?? null},
  }
}

function requireWorkbench(cliConfig: CliConfig): Workbench {
  const workbench = getWorkbench(cliConfig)
  if (!workbench) throw new Error('Not a workbench app — check the deploy adapter selection')
  return workbench
}

function appTitle({cliConfig, flags}: DeployAppOptions, workbench: Workbench): string {
  return flags.title?.trim() || cliConfig.app?.title?.trim() || workbench.name
}

/**
 * A federated app with no entry, view or service would ship a remote with
 * nothing to load — checked first so it fails before any prompt or API call.
 */
function checkDeployable(workbench: Workbench): DeployCheck | null {
  try {
    workbench.assertDeployable()
    return null
  } catch (err) {
    return {
      exitCode: exitCodes.USAGE_ERROR,
      message: getErrorMessage(err),
      solution: 'Declare at least one entry, view, or service in the app',
      status: 'fail',
    }
  }
}

/**
 * An application ships the SDK runtime; a config-only media-library singleton
 * stamps its `sanity` version instead.
 */
function checkAppVersion(workbench: Workbench, workDir: string) {
  if (workbench.hasInterfaces) {
    return checkPackageVersion({moduleName: '@sanity/sdk-react', workDir})
  }
  if (workbench.deploySingletonInstallationConfig) {
    return checkPackageVersion({moduleName: 'sanity', workDir})
  }
  return null
}

type InstallationConfig = NonNullable<Workbench['installationConfig']>

/** The org's installation the singleton config deploys to; only present when configured. */
function installationConfigOf(
  workbench: Workbench,
  organizationId: string | undefined,
): InstallationConfig | null {
  if (!workbench.deploySingletonInstallationConfig || !organizationId) return null
  return workbench.installationConfig?.appType ? workbench.installationConfig : null
}

async function checkInstallationConfig(
  config: InstallationConfig,
  organizationId: string,
): Promise<{check: DeployCheck; installationConfig: string; installationId: string | undefined}> {
  const {appType} = config
  const installationId = await resolveInstallationId({appType, organizationId})
  const installationConfig = summarizeInstallationConfig(config)
  return {
    check: installationId
      ? {message: installationConfig, status: 'pass'}
      : {
          exitCode: exitCodes.USAGE_ERROR,
          message: `No active "${appType}" installation for organization "${organizationId}"`,
          solution: 'Install the Media Library for the organization before deploying its config',
          status: 'fail',
        },
    installationConfig,
    installationId,
  }
}

function exposeChecks(workbench: Workbench): {checks: DeployCheck[]; exposes: DeployedExpose[]} {
  const {exposes, lines} = summarizeExposes(workbench)
  return {checks: lines.map((message) => ({message, status: 'pass' as const})), exposes}
}

function logStudioDeployed({
  applicationId,
  cliConfig,
  output,
}: {
  applicationId: string
  cliConfig: CliConfig
  output: DeployAppOptions['output']
}): void {
  output.log(`\nSuccess! Studio deployed`)
  if (getAppId(cliConfig)) return

  output.log(`\nAdd ${styleText('cyan', `appId: '${applicationId}'`)}`)
  output.log(`to the \`deployment\` section in sanity.cli.js or sanity.cli.ts`)
  output.log(`to avoid prompting for application id on next deploy.`)
}

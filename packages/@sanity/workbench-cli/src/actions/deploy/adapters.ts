// The workbench deploy adapters: federated apps and studios follow the same
// deploy flow as their plain counterparts but ship through the applications
// API (Brett) and register their exposed views/services. A media-library
// singleton additionally (or only, when it exposes nothing) persists its
// installation config to the organization.
//
// Created through a factory so the pieces only the host CLI owns — builds,
// schema upload, config policy checks, success messages — are injected as
// `WorkbenchDeployHost` instead of depended on.

import {styleText} from 'node:util'

import {type CliConfig, exitCodes, getErrorMessage, type Output} from '@sanity/cli-core'
import {
  checkOrganizationId,
  checkProjectId,
  type DeployAdapter,
  type DeployAppOptions,
  type DeployCheck,
  type DeployedExpose,
  type DeployFlags,
  type DeployResult,
  type DeployState,
  type DeployTarget,
  describeAppTarget,
  describeStudioTarget,
  enforce,
  getCoreAppUrl,
  type TargetCheck,
} from '@sanity/cli-core/deploy'
import {spinner} from '@sanity/cli-core/ux'

import {buildExposes, summarizeExposes} from './buildExposes.js'
import {checkBuiltOutput} from './checkBuiltOutput.js'
import {
  deployInstallationConfig,
  resolveInstallationId,
  summarizeInstallationConfig,
} from './deployInstallationConfig.js'
import {deployCoreApp, deployStudio} from './deployWorkbenchApp.js'
import {getWorkbench} from './getWorkbench.js'
import {resolveWorkbenchApp, resolveWorkbenchStudio} from './resolveDeployTarget.js'

type Workbench = NonNullable<ReturnType<typeof getWorkbench>>
type InstallationConfig = NonNullable<Workbench['installationConfig']>

/**
 * What the workbench adapters need from the host CLI: the checks and steps
 * only `@sanity/cli` can perform. Everything workbench-specific lives here.
 * @internal
 */
export interface WorkbenchDeployHost {
  /** Runs the SDK-app build as a check. */
  checkAppBuild(
    options: DeployAppOptions,
    context: {autoUpdatesEnabled: boolean},
  ): Promise<DeployCheck>
  /** Diagnoses the deprecated `app.id` config; `null` when there is nothing to say. */
  checkAppIdConfig(cliConfig: CliConfig): DeployCheck | null
  /** Resolves the auto-update policy from config and flags. */
  checkAutoUpdates(context: {cliConfig: CliConfig; flags: DeployFlags}): {
    checks: DeployCheck[]
    enabled: boolean
  }
  /** Reports the installed version of the framework package the deploy ships. */
  checkPackageVersion(context: {
    moduleName: string
    workDir: string
  }): Promise<{check: DeployCheck; version: string | null}>
  /** Runs the studio build as a check. */
  checkStudioBuild(
    options: DeployAppOptions,
    context: {autoUpdatesEnabled: boolean; isExternal: boolean},
  ): Promise<DeployCheck>
  /** The fail check apps report for `--external`. */
  externalAppNotSupported: DeployCheck
  /** Slug for an application created on first deploy. */
  generateAppSlug(): string
  /** The configured application id (`deployment.appId`, falling back to the deprecated `app.id`). */
  getAppId(cliConfig: CliConfig): string | undefined
  /** Prints the app deploy success message and the config hint. */
  logAppDeployed(context: {
    applicationId: string
    cliConfig: CliConfig
    organizationId: string
    output: Output
    title: string | null
  }): void
  /** Extracts and uploads the studio schema + manifest; exits the deploy on failure. */
  uploadStudioSchema(options: DeployAppOptions, context: {isExternal: boolean}): Promise<unknown>
}

interface WorkbenchState extends DeployState {
  autoUpdatesEnabled: boolean
  workbench: Workbench

  /** The org's installation a singleton config deploys to; resolved by checkOutput. */
  installation?: InstallationConfig
  installationId?: string
  /** The read-only target the acquire step validated; feeds the studio result URL. */
  target?: DeployTarget | null
}

const externalStudioNotSupported: DeployCheck = {
  exitCode: exitCodes.USAGE_ERROR,
  message: 'Deploying a federated application to an external host is not yet supported',
  solution: 'Remove the --external flag to deploy to Sanity hosting',
  status: 'fail',
}

/**
 * The workbench deploy adapters, wired to the host CLI's capabilities.
 * @internal
 */
export function createWorkbenchDeployAdapters(host: WorkbenchDeployHost): {
  app: DeployAdapter<'coreApp', WorkbenchState>
  studio: DeployAdapter<'studio', WorkbenchState>
} {
  return {
    app: {
      acquireTarget: async (options, state) => {
        const target = await appTarget(host, options, state)
        if (target) enforce(options.output, target.check)
        return {...state, target: target?.target ?? null}
      },
      check: (options) => checkApp(host, options),
      checkOutput: (options, state) => checkAppOutput(host, options, state),
      deploy: (options, state) => deployApp(host, options, state),
      describeTarget: (options, state) => appTarget(host, options, state),
      type: 'coreApp',
    },
    studio: {
      acquireTarget: async (options, state) => {
        const target = await studioTarget(host, options, state)
        if (target) enforce(options.output, target.check)
        return {...state, target: target?.target ?? null}
      },
      check: (options) => checkStudio(host, options),
      checkOutput: (options, state) => checkStudioOutput(host, options, state),
      deploy: (options, state) => deployWorkbenchStudio(host, options, state),
      describeTarget: (options, state) => studioTarget(host, options, state),
      type: 'studio',
    },
  }
}

async function checkApp(
  host: WorkbenchDeployHost,
  options: DeployAppOptions,
): Promise<{checks: DeployCheck[]; state: WorkbenchState}> {
  const {cliConfig, flags, projectRoot} = options
  const workbench = requireWorkbench(cliConfig)
  const checks: DeployCheck[] = []

  const deployable = checkDeployable(workbench)
  if (deployable) checks.push(deployable)

  const autoUpdates = host.checkAutoUpdates({cliConfig, flags})
  checks.push(...autoUpdates.checks)

  const pkg = await checkAppVersion(host, workbench, projectRoot.directory)
  if (pkg) checks.push(pkg.check)

  checks.push(checkOrganizationId(cliConfig.app?.organizationId))

  const appIdConfig = host.checkAppIdConfig(cliConfig)
  if (appIdConfig) checks.push(appIdConfig)

  if (flags.external) checks.push(host.externalAppNotSupported)

  return {
    checks,
    state: {autoUpdatesEnabled: autoUpdates.enabled, version: pkg?.version ?? null, workbench},
  }
}

/** The app deploy target; only apps that host an application have one. */
async function appTarget(
  host: WorkbenchDeployHost,
  options: DeployAppOptions,
  state: WorkbenchState,
): Promise<TargetCheck | null> {
  if (options.flags.external || !state.workbench.hasInterfaces) return null
  try {
    return describeAppTarget(await resolveWorkbenchApp({appId: host.getAppId(options.cliConfig)}), {
      title: appTitle(options, state.workbench),
    })
  } catch (err) {
    return {check: {message: getErrorMessage(err), status: 'fail'}, target: null}
  }
}

async function checkAppOutput(
  host: WorkbenchDeployHost,
  options: DeployAppOptions,
  state: WorkbenchState,
): Promise<{checks: DeployCheck[]; state: WorkbenchState}> {
  const {workbench} = state
  const organizationId = options.cliConfig.app?.organizationId
  const checks: DeployCheck[] = []
  const next = {...state}

  checks.push(await host.checkAppBuild(options, {autoUpdatesEnabled: state.autoUpdatesEnabled}))

  const outputDir = await checkOutputDir(options.sourceDir)
  if (outputDir) checks.push(outputDir)

  const installation = installationConfigOf(workbench, organizationId)
  if (installation && organizationId) {
    const config = await checkInstallationConfig(installation, organizationId)
    checks.push(config.check)
    next.installation = installation
    next.installationId = config.installationId
    if (config.installationId) next.installationConfig = config.installationConfig
  }

  if (workbench.hasInterfaces) {
    const exposeReport = exposeChecks(workbench)
    checks.push(...exposeReport.checks)
    next.exposes = exposeReport.exposes
  }

  return {checks, state: next}
}

async function deployApp(
  host: WorkbenchDeployHost,
  options: DeployAppOptions,
  state: WorkbenchState,
): Promise<DeployResult<'coreApp'> | undefined> {
  const {cliConfig, output, sourceDir} = options
  const {installation, installationId, version, workbench} = state
  const organizationId = cliConfig.app?.organizationId
  const title = appTitle(options, workbench)
  if (!version || !organizationId) return

  if (installation && installationId) {
    await deployInstallationConfig({
      appType: installation.appType,
      installationId,
      output,
      sourceDir,
      version,
    })
  }

  // A config-only singleton ships no application, only its installation config.
  if (!workbench.hasInterfaces) {
    if (!installationId) return
    return {
      applicationType: 'coreApp',
      applicationVersion: version,
      ...(state.installationConfig ? {installationConfig: state.installationConfig} : {}),
      installationId,
      target: null,
    }
  }

  const {exposes} = summarizeExposes(workbench)
  const {applicationId} = await deployCoreApp({
    appId: host.getAppId(cliConfig),
    interfaces: buildExposes(workbench, {
      appName: workbench.name,
      appTitle: title,
      exposesAppView: workbench.entry !== undefined,
      version,
    }),
    isAutoUpdating: state.autoUpdatesEnabled,
    organizationId,
    slug: host.generateAppSlug(),
    sourceDir,
    title,
    version,
  })
  host.logAppDeployed({applicationId, cliConfig, organizationId, output, title})

  return {
    applicationType: 'coreApp',
    applicationVersion: version,
    ...(exposes.length > 0 ? {exposes} : {}),
    target: {applicationId, title, url: getCoreAppUrl(organizationId, applicationId)},
  }
}

async function checkStudio(
  host: WorkbenchDeployHost,
  options: DeployAppOptions,
): Promise<{checks: DeployCheck[]; state: WorkbenchState}> {
  const {cliConfig, flags, projectRoot} = options
  const workbench = requireWorkbench(cliConfig)
  const checks: DeployCheck[] = []

  if (flags.external) checks.push(externalStudioNotSupported)

  const autoUpdates = host.checkAutoUpdates({cliConfig, flags})
  checks.push(...autoUpdates.checks)

  const pkg = await host.checkPackageVersion({moduleName: 'sanity', workDir: projectRoot.directory})
  checks.push(
    pkg.check,
    checkProjectId(cliConfig.api?.projectId),
    checkOrganizationId(cliConfig.app?.organizationId),
  )

  return {
    checks,
    state: {
      autoUpdatesEnabled: autoUpdates.enabled,
      uploadsFiles: !flags.external,
      version: pkg.version,
      workbench,
    },
  }
}

async function studioTarget(
  host: WorkbenchDeployHost,
  options: DeployAppOptions,
  state: WorkbenchState,
): Promise<TargetCheck | null> {
  if (options.flags.external) return null
  try {
    const resolution = await resolveWorkbenchStudio({
      appId: host.getAppId(options.cliConfig),
      studioHost: options.cliConfig.studioHost,
    })
    // Workbench studios always deploy to Sanity hosting, never an external URL.
    return describeStudioTarget(resolution, {
      isExternal: false,
      title: appTitle(options, state.workbench),
    })
  } catch (err) {
    return {
      check: {message: `Failed to resolve deploy target: ${getErrorMessage(err)}`, status: 'fail'},
      target: null,
    }
  }
}

async function checkStudioOutput(
  host: WorkbenchDeployHost,
  options: DeployAppOptions,
  state: WorkbenchState,
): Promise<{checks: DeployCheck[]; state: WorkbenchState}> {
  const isExternal = !!options.flags.external
  const checks: DeployCheck[] = []
  const next = {...state}

  checks.push(
    await host.checkStudioBuild(options, {
      autoUpdatesEnabled: state.autoUpdatesEnabled,
      isExternal,
    }),
  )

  if (!isExternal) {
    const outputDir = await checkOutputDir(options.sourceDir)
    if (outputDir) checks.push(outputDir)

    const exposeReport = exposeChecks(state.workbench)
    checks.push(...exposeReport.checks)
    next.exposes = exposeReport.exposes
  }

  return {checks, state: next}
}

async function deployWorkbenchStudio(
  host: WorkbenchDeployHost,
  options: DeployAppOptions,
  state: WorkbenchState,
): Promise<DeployResult<'studio'> | undefined> {
  const {cliConfig, output, sourceDir} = options
  const {version, workbench} = state
  const organizationId = cliConfig.app?.organizationId
  const title = appTitle(options, workbench)
  if (!version || !organizationId) return

  await host.uploadStudioSchema(options, {isExternal: false})

  const {exposes} = summarizeExposes(workbench)
  const {applicationId} = await deployStudio({
    appId: host.getAppId(cliConfig),
    interfaces: buildExposes(workbench, {
      appName: workbench.name,
      appTitle: title,
      exposesAppView: true,
      version,
    }),
    isAutoUpdating: state.autoUpdatesEnabled,
    organizationId,
    output,
    projectId: cliConfig.api?.projectId,
    sourceDir,
    studioHost: cliConfig.studioHost,
    title,
    version,
  })
  logStudioDeployed({appId: host.getAppId(cliConfig), applicationId, output})

  return {
    applicationType: 'studio',
    applicationVersion: version,
    ...(exposes.length > 0 ? {exposes} : {}),
    target: {applicationId, title, url: state.target?.url ?? null},
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

/** The deploy directory must hold a federation remote; a verified directory has nothing to report. */
async function checkOutputDir(sourceDir: string): Promise<DeployCheck | null> {
  const spin = spinner('Verifying local content...').start()
  try {
    await checkBuiltOutput(sourceDir)
    spin.succeed()
    return null
  } catch (err) {
    spin.fail()
    return {
      message: getErrorMessage(err),
      solution: 'Run the build first, or check the output directory',
      status: 'fail',
    }
  }
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
function checkAppVersion(host: WorkbenchDeployHost, workbench: Workbench, workDir: string) {
  if (workbench.hasInterfaces) {
    return host.checkPackageVersion({moduleName: '@sanity/sdk-react', workDir})
  }
  if (workbench.deploySingletonInstallationConfig) {
    return host.checkPackageVersion({moduleName: 'sanity', workDir})
  }
  return null
}

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
  appId,
  applicationId,
  output,
}: {
  appId: string | undefined
  applicationId: string
  output: Output
}): void {
  output.log(`\nSuccess! Studio deployed`)
  if (appId) return

  output.log(`\nAdd ${styleText('cyan', `appId: '${applicationId}'`)}`)
  output.log(`to the \`deployment\` section in sanity.cli.js or sanity.cli.ts`)
  output.log(`to avoid prompting for application id on next deploy.`)
}

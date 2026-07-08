// The host-owned deploy checks: producers that need @sanity/cli internals
// (builds, config policy, the user-applications resolvers). The check
// vocabulary and the generic producers live in @sanity/cli-core/deploy.

import {type CliConfig, getErrorMessage, getLocalPackageVersion} from '@sanity/cli-core'
import {
  type DeployAppOptions,
  type DeployCheck,
  type DeployFlags,
  describeAppTarget,
  describeStudioTarget,
  type TargetCheck,
} from '@sanity/cli-core/deploy'
import {spinner} from '@sanity/cli-core/ux'

import {resolveAppIdIssue} from '../../util/appId.js'
import {EXTERNAL_APP_NOT_SUPPORTED} from '../../util/errorMessages.js'
import {buildApp} from '../build/buildApp.js'
import {buildStudio} from '../build/buildStudio.js'
import {
  getAutoUpdateIssueMessage,
  getAutoUpdateMigrationHint,
  resolveAutoUpdates,
} from '../build/shouldAutoUpdate.js'
import {checkDir} from './checkDir.js'
import {deployDebug} from './deployDebug.js'
import {resolveAppDeployTarget, resolveStudioDeployTarget} from './resolveDeployTarget.js'

export const externalAppNotSupported: DeployCheck = {
  message: EXTERNAL_APP_NOT_SUPPORTED,
  solution: 'Remove the --external flag — apps deploy to Sanity hosting',
  status: 'fail',
}

export async function checkPackageVersion({
  moduleName,
  workDir,
}: {
  moduleName: string
  workDir: string
}): Promise<{check: DeployCheck; version: string | null}> {
  const version = await getLocalPackageVersion(moduleName, workDir)
  return {
    check: version
      ? {message: `Using ${moduleName} ${version}`, status: 'pass'}
      : {
          message: `Failed to find installed ${moduleName} version`,
          solution: `Install ${moduleName} in this project`,
          status: 'fail',
        },
    version,
  }
}

export function checkAutoUpdates({cliConfig, flags}: {cliConfig: CliConfig; flags: DeployFlags}): {
  checks: DeployCheck[]
  enabled: boolean
} {
  const {enabled, issue} = resolveAutoUpdates({cliConfig, flags})
  const checks: DeployCheck[] = []

  if (issue) {
    checks.push({
      message: getAutoUpdateIssueMessage(issue),
      // A config conflict makes a real deploy refuse to run; deprecations only warn
      status: issue.type === 'conflicting-config' ? 'fail' : 'warn',
    })

    // The deprecated top-level config also gets the styled migration edit, the
    // same second warning the build/dev path prints through shouldAutoUpdate.
    if (issue.type === 'deprecated-config') {
      checks.push({
        message: getAutoUpdateMigrationHint(cliConfig.autoUpdates),
        status: 'warn',
      })
    }
  }

  return {checks, enabled}
}

export function checkAppIdConfig(cliConfig: CliConfig): DeployCheck | null {
  const issue = resolveAppIdIssue(cliConfig)
  if (issue === 'conflicting-config') {
    return {
      message: 'Both `app.id` (deprecated) and `deployment.appId` are set',
      solution: 'Remove `app.id` from sanity.cli.ts',
      status: 'fail',
    }
  }
  if (issue === 'deprecated-config') {
    return {
      message: 'The `app.id` config is deprecated',
      solution: 'Move it to `deployment.appId` in sanity.cli.ts',
      status: 'warn',
    }
  }
  return null
}

export function checkStudioBuild(
  options: DeployAppOptions,
  {autoUpdatesEnabled, isExternal}: {autoUpdatesEnabled: boolean; isExternal: boolean},
): Promise<DeployCheck> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options
  return checkBuild({
    build: () =>
      buildStudio({
        autoUpdatesEnabled,
        calledFromDeploy: true,
        cliConfig,
        flags,
        outDir: sourceDir,
        output,
        workDir: projectRoot.directory,
      }),
    skipReason: isExternal ? 'Build skipped for externally hosted studios' : noBuildReason(flags),
    successMessage: 'Studio built',
  })
}

export function checkAppBuild(
  options: DeployAppOptions,
  {autoUpdatesEnabled}: {autoUpdatesEnabled: boolean},
): Promise<DeployCheck> {
  const {cliConfig, flags, output, projectRoot, sourceDir} = options
  return checkBuild({
    build: () =>
      buildApp({
        autoUpdatesEnabled,
        calledFromDeploy: true,
        cliConfig,
        flags,
        outDir: sourceDir,
        output,
        workDir: projectRoot.directory,
      }),
    skipReason: noBuildReason(flags),
    successMessage: 'App built',
  })
}

function noBuildReason(flags: DeployFlags): string | undefined {
  return flags.build
    ? undefined
    : 'Build skipped (--no-build) — validating existing output directory'
}

async function checkBuild({
  build,
  skipReason,
  successMessage,
}: {
  build: () => Promise<void>
  skipReason: string | undefined
  successMessage: string
}): Promise<DeployCheck> {
  if (skipReason) {
    return {message: skipReason, status: 'skip'}
  }
  try {
    await build()
    return {message: successMessage, status: 'pass'}
  } catch (err) {
    deployDebug('build step failed', err)
    return {
      message: `Build failed: ${getErrorMessage(err)}`,
      solution: 'Fix the build error above, then retry',
      status: 'fail',
    }
  }
}

/** The deploy directory must hold an `index.html` SPA; a verified directory has nothing to report. */
export async function checkOutputDir(sourceDir: string): Promise<DeployCheck | null> {
  const spin = spinner('Verifying local content...').start()
  try {
    await checkDir(sourceDir)
    spin.succeed()
    return null
  } catch (err) {
    spin.fail()
    deployDebug('Error checking directory', err)
    return {
      message: getErrorMessage(err),
      solution: 'Run the build first, or check the output directory',
      status: 'fail',
    }
  }
}

export function describeAppTargetError(err: unknown, organizationId: string | undefined): string {
  return (err as {statusCode?: number})?.statusCode === 403
    ? `You don’t have permission to view applications for the configured organization ID ("${organizationId}"). Verify the organization ID, or ask your organization’s admin for access.`
    : `Failed to resolve deploy target: ${getErrorMessage(err)}`
}

/**
 * Resolves the app deploy target read-only against user-applications. A real
 * deploy resolves interactively instead (see `findUserApplication`).
 */
export async function checkAppTarget(options: {
  appId: string | undefined
  organizationId: string | undefined
  title?: string
}): Promise<TargetCheck> {
  try {
    const resolution = await resolveAppDeployTarget({
      appId: options.appId,
      organizationId: options.organizationId,
    })
    return describeAppTarget(resolution, {title: options.title})
  } catch (err) {
    deployDebug('target step failed', err)
    return {
      check: {message: describeAppTargetError(err, options.organizationId), status: 'fail'},
      target: null,
    }
  }
}

/** Same contract as {@link checkAppTarget}, for the studio target rules. */
export async function checkStudioTarget(options: {
  appId: string | undefined
  isExternal: boolean
  projectId: string | undefined
  studioHost: string | undefined
  title: string | undefined
  urlFlag: string | undefined
}): Promise<TargetCheck> {
  try {
    const resolution = await resolveStudioDeployTarget(options)
    return describeStudioTarget(resolution, {isExternal: options.isExternal, title: options.title})
  } catch (err) {
    deployDebug('target step failed', err)
    return {
      check: {message: `Failed to resolve deploy target: ${getErrorMessage(err)}`, status: 'fail'},
      target: null,
    }
  }
}

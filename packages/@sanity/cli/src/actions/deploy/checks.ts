// The checks a deploy enforces, as plain producers that never print or exit.
// A dry-run plan collects them into a report; a real deploy passes each
// through `enforce`. One producer backs both modes so messages can't drift.

import {type CliConfig, exitCodes, getLocalPackageVersion, type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {checkBuiltOutput} from '@sanity/workbench-cli/deploy'

import {resolveAppIdIssue} from '../../util/appId.js'
import {
  APP_ID_NOT_FOUND_IN_ORGANIZATION,
  EXTERNAL_APP_NOT_SUPPORTED,
  NO_ORGANIZATION_ID,
  NO_PROJECT_ID,
} from '../../util/errorMessages.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {buildApp} from '../build/buildApp.js'
import {buildStudio} from '../build/buildStudio.js'
import {
  getAutoUpdateIssueMessage,
  getAutoUpdateMigrationHint,
  resolveAutoUpdates,
} from '../build/shouldAutoUpdate.js'
import {checkDir} from './checkDir.js'
import {deployDebug} from './deployDebug.js'
import {
  type AppDeployTargetResolution,
  resolveAppDeployTarget,
  resolveStudioDeployTarget,
  resolveWorkbenchApp,
  resolveWorkbenchStudio,
  type StudioDeployTargetResolution,
} from './resolveDeployTarget.js'
import {type DeployAppOptions, type DeployFlags} from './types.js'
import {getCoreAppUrl} from './urlUtils.js'

export interface DeployCheck {
  message: string
  status: 'fail' | 'pass' | 'skip' | 'warn'

  /** Exit code a real deploy uses when this check fails; defaults to 1 */
  exitCode?: number
  /** Actionable fix, shown under a failing or warning check */
  solution?: string
}

/** Where a deploy resolves to; the dry-run report and `--json` both read it. */
export interface DeployTarget {
  /** The application the deploy targets; `null` when a deploy would create one. */
  applicationId: string | null
  /** The application's title; `null` when it has none (or isn't created yet). */
  title: string | null
  /** Where the deployed studio/app is reachable; `null` when it can't be resolved yet. */
  url: string | null
}

export interface TargetCheck {
  check: DeployCheck
  target: DeployTarget | null
}

export const externalAppNotSupported: DeployCheck = {
  message: EXTERNAL_APP_NOT_SUPPORTED,
  solution: 'Remove the --external flag — apps deploy to Sanity hosting',
  status: 'fail',
}

/** A `fail` prints and exits (the thrown exit aborts the deploy), a `warn` prints, the rest is silent. */
export function enforce(output: Output, check: DeployCheck): void {
  const text = check.solution ? `${check.message}: ${check.solution}` : check.message
  if (check.status === 'fail') {
    output.error(text, {exit: check.exitCode ?? 1})
  } else if (check.status === 'warn') {
    output.warn(text)
  }
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

export function checkProjectId(projectId: string | undefined): DeployCheck {
  return projectId
    ? {message: `Project: ${projectId}`, status: 'pass'}
    : {message: NO_PROJECT_ID, solution: 'Add `api.projectId` to sanity.cli.ts', status: 'fail'}
}

export function checkOrganizationId(organizationId: string | undefined): DeployCheck {
  return organizationId
    ? {message: `Organization: ${organizationId}`, status: 'pass'}
    : {
        message: NO_ORGANIZATION_ID,
        solution: 'Add `app.organizationId` to sanity.cli.ts',
        status: 'fail',
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

/**
 * The deploy directory must hold the right build output: a federation remote
 * for a workbench app, an `index.html` SPA otherwise. A verified directory has
 * nothing to report.
 */
export async function checkOutputDir({
  isWorkbenchApp,
  sourceDir,
}: {
  isWorkbenchApp: boolean
  sourceDir: string
}): Promise<DeployCheck | null> {
  const spin = spinner('Verifying local content...').start()
  const verifyBuild = isWorkbenchApp ? checkBuiltOutput : checkDir
  try {
    await verifyBuild(sourceDir)
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

/**
 * The single diagnosis for each app deploy-target verdict, shared by the
 * dry-run report and the real deploy's unattended error paths.
 */
export function describeAppTarget(
  resolution: AppDeployTargetResolution,
  {title}: {title?: string} = {},
): TargetCheck {
  switch (resolution.type) {
    case 'blocked': {
      return {
        check: {message: `Deploy target not resolved — ${resolution.message}`, status: 'skip'},
        target: null,
      }
    }
    case 'found': {
      const {application} = resolution
      const name = application.title ?? application.appHost
      const url = getCoreAppUrl(application.organizationId, application.id)
      return {
        check: {message: `Deploys to existing application "${name}" at ${url}`, status: 'pass'},
        target: {applicationId: application.id, title: application.title ?? null, url},
      }
    }
    case 'invalid': {
      return {
        check: {
          message: APP_ID_NOT_FOUND_IN_ORGANIZATION,
          solution: 'Check `deployment.appId` matches an app in your organization',
          status: 'fail',
        },
        target: null,
      }
    }
    case 'needs-input': {
      return {
        check: {
          exitCode: exitCodes.USAGE_ERROR,
          message: `No \`deployment.appId\` configured (${resolution.existing.length} existing ${resolution.existing.length === 1 ? 'application' : 'applications'} to choose from)`,
          solution: 'Add `deployment.appId` to sanity.cli.ts',
          status: 'fail',
        },
        target: null,
      }
    }
    // Without --title, creating an app needs a prompt no unattended run can answer
    case 'would-create': {
      if (title) {
        return {
          check: {message: `Would create a new application "${title}"`, status: 'pass'},
          target: {applicationId: null, title, url: null},
        }
      }
      return {
        check: {
          exitCode: exitCodes.USAGE_ERROR,
          message: 'No application to deploy to — creating one needs a title',
          solution:
            'Pass `--title "<name>"` or set `app.title` in sanity.cli.ts to create one, or set `deployment.appId` to deploy to an existing app',
          status: 'fail',
        },
        target: null,
      }
    }
  }
}

export function describeAppTargetError(err: unknown, organizationId: string | undefined): string {
  return (err as {statusCode?: number})?.statusCode === 403
    ? `You don’t have permission to view applications for the configured organization ID ("${organizationId}"). Verify the organization ID, or ask your organization’s admin for access.`
    : `Failed to resolve deploy target: ${getErrorMessage(err)}`
}

/**
 * Resolves the app deploy target read-only; `isWorkbenchApp` selects the
 * backend. A real deploy runs it too, to reject a bad `appId` before building.
 */
export async function checkAppTarget(
  options:
    | {appId: string | undefined; isWorkbenchApp: true; title?: string}
    | {
        appId: string | undefined
        isWorkbenchApp?: false
        organizationId: string | undefined
        title?: string
      },
): Promise<TargetCheck> {
  try {
    const resolution = options.isWorkbenchApp
      ? await resolveWorkbenchApp({appId: options.appId})
      : await resolveAppDeployTarget({appId: options.appId, organizationId: options.organizationId})
    return describeAppTarget(resolution, {title: options.title})
  } catch (err) {
    deployDebug('target step failed', err)
    const message = options.isWorkbenchApp
      ? getErrorMessage(err)
      : describeAppTargetError(err, options.organizationId)
    return {check: {message, status: 'fail'}, target: null}
  }
}

/** Same contract as {@link describeAppTarget}, for the studio verdicts. */
export function describeStudioTarget(
  resolution: StudioDeployTargetResolution,
  {isExternal, title}: {isExternal: boolean; title?: string},
): TargetCheck {
  const studioUrl = (host: string) => (isExternal ? host : `https://${host}.sanity.studio`)

  switch (resolution.type) {
    case 'blocked': {
      return {
        check: {message: `Deploy target not resolved — ${resolution.message}`, status: 'skip'},
        target: null,
      }
    }
    case 'found': {
      const url = studioUrl(resolution.application.appHost)
      return {
        check: {message: `Deploys to existing studio ${url}`, status: 'pass'},
        target: {
          applicationId: resolution.application.id,
          title: resolution.application.title ?? null,
          url,
        },
      }
    }
    case 'invalid': {
      return {
        check: {
          // A bad host is a usage error; other invalid targets exit 1
          exitCode: resolution.reason === 'invalid-host' ? exitCodes.USAGE_ERROR : 1,
          message: resolution.message,
          solution: 'Check `studioHost` and `deployment.appId` in sanity.cli.ts',
          status: 'fail',
        },
        target: null,
      }
    }
    case 'needs-input': {
      return {
        check: {
          exitCode: exitCodes.USAGE_ERROR,
          message: isExternal
            ? 'No external studio URL configured'
            : 'No studio hostname configured',
          solution: isExternal
            ? 'Set `studioHost` in sanity.cli.ts, or pass the full URL with --url'
            : 'Set `studioHost` in sanity.cli.ts, or pass a hostname with --url',
          status: 'fail',
        },
        target: null,
      }
    }
    case 'would-create': {
      const url = studioUrl(resolution.appHost)
      const titled = title ? ` titled "${title}"` : ''
      return {
        check: {
          message: isExternal
            ? `Would register external studio at ${resolution.appHost}${titled}`
            : `Would create studio hostname ${url}${titled} (name availability is checked on deploy)`,
          status: 'pass',
        },
        // `title || null`, not `?? null`, so target.title tracks the same
        // truthiness the message's `titled` suffix uses (an empty title is no title)
        target: {applicationId: null, title: title || null, url},
      }
    }
  }
}

/**
 * Resolves the studio deploy target read-only; `isWorkbenchApp` selects the
 * backend. A real deploy runs it too, to reject a bad `appId` before building
 * and to report the studio URL from the resolved slug.
 */
export async function checkStudioTarget(
  options:
    | {
        appId: string | undefined
        isExternal: boolean
        isWorkbenchApp?: false
        projectId: string | undefined
        studioHost: string | undefined
        title: string | undefined
        urlFlag: string | undefined
      }
    | {
        appId: string | undefined
        isWorkbenchApp: true
        studioHost: string | undefined
        title?: string
      },
): Promise<TargetCheck> {
  // Workbench studios always deploy to Sanity hosting, never an external URL.
  const isExternal = options.isWorkbenchApp ? false : options.isExternal
  try {
    const resolution = options.isWorkbenchApp
      ? await resolveWorkbenchStudio({appId: options.appId, studioHost: options.studioHost})
      : await resolveStudioDeployTarget(options)
    return describeStudioTarget(resolution, {isExternal, title: options.title})
  } catch (err) {
    deployDebug('target step failed', err)
    return {
      check: {message: `Failed to resolve deploy target: ${getErrorMessage(err)}`, status: 'fail'},
      target: null,
    }
  }
}

import {type CliConfig, exitCodes, getLocalPackageVersion, type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {checkBuiltOutput, type DeployedExpose} from '@sanity/workbench-cli/deploy'

import {resolveAppIdIssue} from '../../util/appId.js'
import {APP_ID_NOT_FOUND_IN_ORGANIZATION} from '../../util/errorMessages.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
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
import {type DeployFlags} from './types.js'
import {getCoreAppUrl} from './urlUtils.js'

type DeployCheckStatus = 'fail' | 'pass' | 'skip' | 'warn'

/**
 * Where a deploy resolves to, computed once from the deploy-target verdict. The
 * dry-run report and its JSON both read this, so the human and machine outputs
 * can't drift.
 */
export interface DeployTarget {
  /** The application the deploy targets; `null` when a deploy would create one. */
  applicationId: string | null
  /** The application's title; `null` when it has none (or isn't created yet). */
  title: string | null
  /** Where the deployed studio/app is reachable; `null` when it can't be resolved yet. */
  url: string | null
}

export interface DeployCheck {
  message: string
  status: DeployCheckStatus

  /** Exit code a real deploy uses when this check fails; defaults to 1 */
  exitCode?: number
  /** Set on the exposes check with the workbench exposes both reporters read. */
  exposes?: DeployedExpose[]
  /** Set on the installation-config check with its summary both reporters read. */
  installationConfig?: string
  /** Set on the singleton check when the app declares the flag explicitly. */
  isSingleton?: boolean
  /** Actionable fix, shown under a failing or warning check */
  solution?: string
  /** Set on the deploy-target check with the resolved target both reporters read. */
  target?: DeployTarget
  /** Set on the package-version check with the version both reporters read. */
  version?: string
}

/**
 * Where deploy steps send their check outcomes — and the only place the deploy
 * mode lives. A real deploy fails fast: a `fail` prints and exits immediately,
 * which aborts the sequence. A dry run collects every outcome and never exits.
 * Steps just call `report`; they never know which mode is running.
 */
export interface CheckReporter {
  report(check: DeployCheck): void
}

export function createFailFastReporter(output: Output): CheckReporter {
  return {
    report(check) {
      // Fixes surface in both modes: appended after the message here, and in the
      // dry-run report, so the problem and its fix never drift apart.
      const text = check.solution ? `${check.message}: ${check.solution}` : check.message
      if (check.status === 'fail') {
        output.error(text, {exit: check.exitCode ?? 1})
      } else if (check.status === 'warn') {
        output.warn(text)
      }
    },
  }
}

export function createCollectingReporter(): CheckReporter & {results: DeployCheck[]} {
  const results: DeployCheck[] = []
  return {
    report(check) {
      results.push(check)
    },
    results,
  }
}

/**
 * Runs a fallible step and turns a throw into a `fail` check. In a real deploy
 * that fail exits (aborting the run); in a dry run it's recorded and `null`
 * comes back so the caller can skip the rest of the step. `name` labels the
 * step in debug logs.
 */
export async function runStep<T>(
  reporter: CheckReporter,
  name: string,
  work: () => Promise<T>,
  formatError: (err: unknown) => string = getErrorMessage,
  solution?: string,
): Promise<T | null> {
  try {
    return await work()
  } catch (err) {
    deployDebug(`${name} step failed`, err)
    reporter.report({message: formatError(err), solution, status: 'fail'})
    return null
  }
}

export async function checkPackageVersion(
  reporter: CheckReporter,
  {moduleName, workDir}: {moduleName: string; workDir: string},
): Promise<string | null> {
  const version = await getLocalPackageVersion(moduleName, workDir)
  reporter.report(
    version
      ? {message: `Using ${moduleName} ${version}`, status: 'pass', version}
      : {
          message: `Failed to find installed ${moduleName} version`,
          solution: `Install ${moduleName} in this project`,
          status: 'fail',
        },
  )
  return version
}

export function checkAutoUpdates(
  reporter: CheckReporter,
  {cliConfig, flags}: {cliConfig: CliConfig; flags: DeployFlags},
): boolean {
  const {enabled, issue} = resolveAutoUpdates({cliConfig, flags})

  if (issue) {
    reporter.report({
      message: getAutoUpdateIssueMessage(issue),
      // A config conflict makes a real deploy refuse to run; deprecations only warn
      status: issue.type === 'conflicting-config' ? 'fail' : 'warn',
    })

    // The deprecated top-level config also gets the styled migration edit, the
    // same second warning the build/dev path prints through shouldAutoUpdate.
    if (issue.type === 'deprecated-config') {
      reporter.report({
        message: getAutoUpdateMigrationHint(cliConfig.autoUpdates),
        status: 'warn',
      })
    }
  }

  return enabled
}

/**
 * The dry-run form of the `app.id` config check a real deploy runs in
 * `findUserApplication`: a conflict fails (both `app.id` and `deployment.appId`
 * set), the deprecated config alone warns.
 */
export function checkAppId(reporter: CheckReporter, {cliConfig}: {cliConfig: CliConfig}): void {
  const issue = resolveAppIdIssue(cliConfig)
  if (issue === 'conflicting-config') {
    reporter.report({
      message: 'Both `app.id` (deprecated) and `deployment.appId` are set',
      solution: 'Remove `app.id` from sanity.cli.ts',
      status: 'fail',
    })
  } else if (issue === 'deprecated-config') {
    reporter.report({
      message: 'The `app.id` config is deprecated',
      solution: 'Move it to `deployment.appId` in sanity.cli.ts',
      status: 'warn',
    })
  }
}

export async function checkBuild(
  reporter: CheckReporter,
  {
    build,
    skipReason,
    successMessage,
  }: {build: () => Promise<void>; skipReason: string | undefined; successMessage: string},
): Promise<void> {
  if (skipReason) {
    reporter.report({message: skipReason, status: 'skip'})
    return
  }

  await runStep(
    reporter,
    'build',
    async () => {
      await build()
      reporter.report({message: successMessage, status: 'pass'})
    },
    (err) => `Build failed: ${getErrorMessage(err)}`,
    'Fix the build error above, then retry',
  )
}

/**
 * The deploy directory must exist and hold the right build output: a federation
 * remote for a workbench app, an `index.html` SPA otherwise.
 */
export async function verifyOutputDir({
  isWorkbenchApp,
  reporter,
  sourceDir,
}: {
  isWorkbenchApp: boolean
  reporter: CheckReporter
  sourceDir: string
}): Promise<void> {
  const spin = spinner('Verifying local content...').start()
  const verifyBuild = isWorkbenchApp ? checkBuiltOutput : checkDir
  try {
    await verifyBuild(sourceDir)
    spin.succeed()
  } catch (err) {
    spin.fail()
    deployDebug('Error checking directory', err)
    reporter.report({
      message: getErrorMessage(err),
      solution: 'Run the build first, or check the output directory',
      status: 'fail',
    })
  }
}

/**
 * The single diagnosis for each app deploy-target verdict, shared by the
 * dry-run report and the real deploy's unattended error paths so message,
 * fix, and exit code can't drift between the two.
 */
export function describeAppTarget(
  resolution: AppDeployTargetResolution,
  {title}: {title?: string} = {},
): DeployCheck {
  switch (resolution.type) {
    case 'blocked': {
      return {message: `Deploy target not resolved — ${resolution.message}`, status: 'skip'}
    }
    case 'found': {
      const {application} = resolution
      const title = application.title ?? application.appHost
      const url = getCoreAppUrl(application.organizationId, application.id)
      return {
        message: `Deploys to existing application "${title}" at ${url}`,
        status: 'pass',
        target: {applicationId: application.id, title: application.title ?? null, url},
      }
    }
    case 'invalid': {
      return {
        message: APP_ID_NOT_FOUND_IN_ORGANIZATION,
        solution: 'Check `deployment.appId` matches an app in your organization',
        status: 'fail',
      }
    }
    case 'needs-input': {
      return {
        exitCode: exitCodes.USAGE_ERROR,
        message: `No \`deployment.appId\` configured (${resolution.existing.length} existing ${resolution.existing.length === 1 ? 'application' : 'applications'} to choose from)`,
        solution: 'Add `deployment.appId` to sanity.cli.ts',
        status: 'fail',
      }
    }
    // Without --title, creating an app needs a prompt no unattended run can answer
    case 'would-create': {
      if (title) {
        return {
          message: `Would create a new application "${title}"`,
          status: 'pass',
          target: {applicationId: null, title, url: null},
        }
      }
      return {
        exitCode: exitCodes.USAGE_ERROR,
        message: 'No application to deploy to — creating one needs a title',
        solution:
          'Pass `--title "<name>"` or set `app.title` in sanity.cli.ts to create one, or set `deployment.appId` to deploy to an existing app',
        status: 'fail',
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
 * Reports the app deploy target as a check and returns the resolved target;
 * `isWorkbenchApp` selects the backend. Both modes run it — a real deploy uses
 * it to reject a bad `appId` before building.
 */
export async function checkAppTarget(
  reporter: CheckReporter,
  options:
    | {appId: string | undefined; isWorkbenchApp: true; title?: string}
    | {
        appId: string | undefined
        isWorkbenchApp?: false
        organizationId: string | undefined
        title?: string
      },
): Promise<DeployTarget | null> {
  const {title} = options
  if (options.isWorkbenchApp) {
    const {appId} = options
    return runStep(reporter, 'target', async () => {
      const check = describeAppTarget(await resolveWorkbenchApp({appId}), {title})
      reporter.report(check)
      return check.target ?? null
    })
  }

  const {appId, organizationId} = options
  return runStep(
    reporter,
    'target',
    async () => {
      const check = describeAppTarget(await resolveAppDeployTarget({appId, organizationId}), {
        title,
      })
      reporter.report(check)
      return check.target ?? null
    },
    (err) => describeAppTargetError(err, organizationId),
  )
}

/** Same contract as {@link describeAppTarget}, for the studio verdicts. */
export function describeStudioTarget(
  resolution: StudioDeployTargetResolution,
  {isExternal, title}: {isExternal: boolean; title?: string},
): DeployCheck {
  const studioUrl = (host: string) => (isExternal ? host : `https://${host}.sanity.studio`)

  switch (resolution.type) {
    case 'blocked': {
      return {message: `Deploy target not resolved — ${resolution.message}`, status: 'skip'}
    }
    case 'found': {
      const url = studioUrl(resolution.application.appHost)
      return {
        message: `Deploys to existing studio ${url}`,
        status: 'pass',
        target: {
          applicationId: resolution.application.id,
          title: resolution.application.title ?? null,
          url,
        },
      }
    }
    case 'invalid': {
      return {
        // A bad host is a usage error; other invalid targets exit 1
        exitCode: resolution.reason === 'invalid-host' ? exitCodes.USAGE_ERROR : 1,
        message: resolution.message,
        solution: 'Check `studioHost` and `deployment.appId` in sanity.cli.ts',
        status: 'fail',
      }
    }
    case 'needs-input': {
      return {
        exitCode: exitCodes.USAGE_ERROR,
        message: isExternal ? 'No external studio URL configured' : 'No studio hostname configured',
        solution: isExternal
          ? 'Set `studioHost` in sanity.cli.ts, or pass the full URL with --url'
          : 'Set `studioHost` in sanity.cli.ts, or pass a hostname with --url',
        status: 'fail',
      }
    }
    case 'would-create': {
      const url = studioUrl(resolution.appHost)
      const titled = title ? ` titled "${title}"` : ''
      return {
        message: isExternal
          ? `Would register external studio at ${resolution.appHost}${titled}`
          : `Would create studio hostname ${url}${titled} (name availability is checked on deploy)`,
        status: 'pass',
        // `title || null`, not `?? null`, so target.title tracks the same
        // truthiness the message's `titled` suffix uses (an empty title is no title)
        target: {applicationId: null, title: title || null, url},
      }
    }
  }
}

/**
 * Reports the studio deploy target as a check and returns the resolved target;
 * `isWorkbenchApp` selects the backend. Both modes run it — a real deploy uses
 * the returned target to reject a bad `appId` before building and to report the
 * studio URL from the resolved slug.
 */
export async function checkStudioTarget(
  reporter: CheckReporter,
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
): Promise<DeployTarget | null> {
  const {title} = options
  const resolve = options.isWorkbenchApp
    ? resolveWorkbenchStudio({appId: options.appId, studioHost: options.studioHost})
    : resolveStudioDeployTarget(options)
  // Workbench studios always deploy to Sanity hosting, never an external URL.
  const isExternal = options.isWorkbenchApp ? false : options.isExternal

  return runStep(
    reporter,
    'target',
    async () => {
      const check = describeStudioTarget(await resolve, {isExternal, title})
      reporter.report(check)
      return check.target ?? null
    },
    (err) => `Failed to resolve deploy target: ${getErrorMessage(err)}`,
  )
}

import {type CliConfig, getLocalPackageVersion, type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {checkBuiltOutput} from '@sanity/workbench-cli/deploy'

import {
  APP_ID_NOT_FOUND_IN_ORGANIZATION,
  cannotPromptForStudioHost,
} from '../../util/errorMessages.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {
  getAutoUpdateIssueMessage,
  getAutoUpdateMigrationHint,
  resolveAutoUpdates,
} from '../build/shouldAutoUpdate.js'
import {checkDir} from './checkDir.js'
import {deployDebug} from './deployDebug.js'
import {resolveAppDeployTarget, resolveStudioDeployTarget} from './resolveDeployTarget.js'
import {type DeployFlags} from './types.js'

type DeployCheckStatus = 'fail' | 'pass' | 'skip' | 'warn'

export interface DeployCheck {
  message: string
  status: DeployCheckStatus

  /** Exit code a real deploy uses when this check fails; defaults to 1 */
  exitCode?: number
  /** Actionable fix, shown under a failing or warning check */
  solution?: string
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
      if (check.status === 'fail') {
        output.error(check.message, {exit: check.exitCode ?? 1})
      } else if (check.status === 'warn') {
        output.warn(check.message)
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
      ? {message: `Using ${moduleName} ${version}`, status: 'pass'}
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
 * Reports the read-only app deploy-target verdict. The rules live in
 * resolveDeployTarget; a real deploy consumes the same verdicts through
 * findUserApplication.
 */
export async function checkAppTarget(
  reporter: CheckReporter,
  {appId, organizationId}: {appId: string | undefined; organizationId: string | undefined},
): Promise<void> {
  await runStep(
    reporter,
    'target',
    async () => {
      const resolution = await resolveAppDeployTarget({appId, organizationId})

      switch (resolution.type) {
        case 'blocked': {
          reporter.report({
            message: `Deploy target not resolved — ${resolution.message}`,
            status: 'skip',
          })
          return
        }
        case 'found': {
          const {application} = resolution
          reporter.report({
            message: `Deploys to existing application "${application.title ?? application.appHost}"`,
            status: 'pass',
          })
          return
        }
        case 'invalid': {
          reporter.report({
            message: APP_ID_NOT_FOUND_IN_ORGANIZATION,
            solution: 'Check `deployment.appId` matches an app in your organization',
            status: 'fail',
          })
          return
        }
        case 'needs-input': {
          reporter.report({
            message: `No \`deployment.appId\` configured and ${resolution.existing.length} existing ${resolution.existing.length === 1 ? 'application' : 'applications'} found — a real deploy would prompt`,
            solution: 'Add `deployment.appId` to sanity.cli.ts',
            status: 'fail',
          })
          return
        }
        case 'would-create': {
          reporter.report({message: 'Would create a new application deployment', status: 'pass'})
          return
        }
      }
    },
    (err) =>
      (err as {statusCode?: number})?.statusCode === 403
        ? `You don’t have permission to view applications for the configured organization ID ("${organizationId}"). Verify the organization ID, or ask your organization’s admin for access.`
        : `Failed to resolve deploy target: ${getErrorMessage(err)}`,
  )
}

/**
 * Reports the read-only studio deploy-target verdict. The rules live in
 * resolveDeployTarget; a real deploy consumes the same verdicts through
 * findUserApplicationForStudio.
 */
export async function checkStudioTarget(
  reporter: CheckReporter,
  {
    appId,
    isExternal,
    projectId,
    studioHost,
    urlFlag,
  }: {
    appId: string | undefined
    isExternal: boolean
    projectId: string | undefined
    studioHost: string | undefined
    urlFlag: string | undefined
  },
): Promise<void> {
  const studioUrl = (host: string) => (isExternal ? host : `https://${host}.sanity.studio`)

  await runStep(
    reporter,
    'target',
    async () => {
      const resolution = await resolveStudioDeployTarget({
        appId,
        isExternal,
        projectId,
        studioHost,
        urlFlag,
      })

      switch (resolution.type) {
        case 'blocked': {
          reporter.report({
            message: `Deploy target not resolved — ${resolution.message}`,
            status: 'skip',
          })
          return
        }
        case 'found': {
          reporter.report({
            message: `Deploys to existing studio ${studioUrl(resolution.application.appHost)}`,
            status: 'pass',
          })
          return
        }
        case 'invalid': {
          reporter.report({
            message: resolution.message,
            solution: 'Check `studioHost` and `deployment.appId` in sanity.cli.ts',
            status: 'fail',
          })
          return
        }
        case 'needs-input': {
          // The same constraint an unattended deploy enforces, with the same message
          reporter.report({
            message: cannotPromptForStudioHost(isExternal),
            solution: 'Set `studioHost` in sanity.cli.ts, or pass a hostname with --url',
            status: 'fail',
          })
          return
        }
        case 'would-create': {
          const {appHost} = resolution
          reporter.report({
            message: isExternal
              ? `Would register external studio at ${appHost}`
              : `Would create studio hostname ${studioUrl(appHost)} (name availability is checked on deploy)`,
            status: 'pass',
          })
          return
        }
      }
    },
    (err) => `Failed to resolve deploy target: ${getErrorMessage(err)}`,
  )
}

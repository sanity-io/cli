import {type CliConfig, getLocalPackageVersion, type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {checkBuiltOutput} from '@sanity/workbench-cli/deploy'

import {type UserApplication} from '../../services/userApplications.js'
import {APP_ID_NOT_FOUND_IN_ORGANIZATION} from '../../util/errorMessages.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {
  getAutoUpdateIssueMessage,
  getAutoUpdateMigrationHint,
  resolveAutoUpdates,
} from '../build/shouldAutoUpdate.js'
import {checkDir} from './checkDir.js'
import {deployDebug} from './deployDebug.js'
import {resolveAppDeployTarget} from './resolveDeployTarget.js'
import {type DeployFlags} from './types.js'

type DeployCheckStatus = 'fail' | 'pass' | 'skip' | 'warn'

interface DeployCheck {
  message: string

  /** Stable identifier for machine consumers; the message carries the details */
  name: string
  status: DeployCheckStatus

  /** Exit code a real deploy uses when this check fails; defaults to 1 */
  exitCode?: number
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
 * comes back so the caller can skip the rest of the step.
 */
export async function runStep<T>(
  reporter: CheckReporter,
  name: string,
  work: () => Promise<T>,
  formatError: (err: unknown) => string = getErrorMessage,
): Promise<T | null> {
  try {
    return await work()
  } catch (err) {
    deployDebug(`${name} step failed`, err)
    reporter.report({message: formatError(err), name, status: 'fail'})
    return null
  }
}

export async function checkPackageVersion(
  reporter: CheckReporter,
  {moduleName, name, workDir}: {moduleName: string; name: string; workDir: string},
): Promise<string | null> {
  const version = await getLocalPackageVersion(moduleName, workDir)
  reporter.report(
    version
      ? {message: `Using ${moduleName} ${version}`, name, status: 'pass'}
      : {message: `Failed to find installed ${moduleName} version`, name, status: 'fail'},
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
      name: 'auto-updates',
      // A config conflict makes a real deploy refuse to run; deprecations only warn
      status: issue.type === 'conflicting-config' ? 'fail' : 'warn',
    })

    // The deprecated top-level config also gets the styled migration edit, the
    // same second warning the build/dev path prints through shouldAutoUpdate.
    if (issue.type === 'deprecated-config') {
      reporter.report({
        message: getAutoUpdateMigrationHint(cliConfig.autoUpdates),
        name: 'auto-updates',
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
    reporter.report({message: skipReason, name: 'build', status: 'skip'})
    return
  }

  await runStep(
    reporter,
    'build',
    async () => {
      await build()
      reporter.report({message: successMessage, name: 'build', status: 'pass'})
    },
    (err) => `Build failed: ${getErrorMessage(err)}`,
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
    reporter.report({message: getErrorMessage(err), name: 'output-dir', status: 'fail'})
  }
}

interface DeployTarget {
  /** User application id when the deploy targets an existing application */
  appId: string | null
  /** Whether the target application already exists (false means deploy would create it) */
  exists: boolean
  /** Studio hostname or external URL */
  host: string | null
  /** A studio deployed to a host outside sanity.studio; always false for apps */
  isExternal: boolean
  type: 'coreApp' | 'studio'
}

/**
 * Maps the read-only app deploy-target verdict to a check and a target
 * descriptor. The rules live in resolveDeployTarget; a real deploy consumes the
 * same verdicts through findUserApplicationForApp.
 */
export async function checkAppTarget(
  reporter: CheckReporter,
  {appId, organizationId}: {appId: string | undefined; organizationId: string | undefined},
): Promise<{existingApp: UserApplication | null; target: DeployTarget | null}> {
  const result = await runStep(
    reporter,
    'target',
    async () => {
      const resolution = await resolveAppDeployTarget({appId, organizationId})

      switch (resolution.type) {
        case 'blocked': {
          reporter.report({
            message: `Deploy target not resolved — ${resolution.message}`,
            name: 'target',
            status: 'skip',
          })
          return {existingApp: null, target: null}
        }
        case 'found': {
          const {application} = resolution
          reporter.report({
            message: `Deploys to existing application "${application.title ?? application.appHost}"`,
            name: 'target',
            status: 'pass',
          })
          return {
            existingApp: application,
            target: {
              appId: application.id,
              exists: true,
              host: application.appHost,
              isExternal: false,
              type: 'coreApp' as const,
            },
          }
        }
        case 'invalid': {
          reporter.report({
            message: APP_ID_NOT_FOUND_IN_ORGANIZATION,
            name: 'target',
            status: 'fail',
          })
          return {existingApp: null, target: null}
        }
        case 'needs-input': {
          reporter.report({
            message: `No appId configured and ${resolution.existing.length} existing ${resolution.existing.length === 1 ? 'application' : 'applications'} found — deploy would prompt. Add deployment.appId to sanity.cli.ts.`,
            name: 'target',
            status: 'fail',
          })
          return {existingApp: null, target: null}
        }
        case 'would-create': {
          reporter.report({
            message: 'Would create a new application deployment',
            name: 'target',
            status: 'pass',
          })
          return {
            existingApp: null,
            target: {
              appId: null,
              exists: false,
              host: null,
              isExternal: false,
              type: 'coreApp' as const,
            },
          }
        }
      }
    },
    (err) =>
      (err as {statusCode?: number})?.statusCode === 403
        ? `You don’t have permission to view applications for the configured organization ID ("${organizationId}"). Verify the organization ID, or ask your organization’s admin for access.`
        : `Failed to resolve deploy target: ${getErrorMessage(err)}`,
  )

  return result ?? {existingApp: null, target: null}
}

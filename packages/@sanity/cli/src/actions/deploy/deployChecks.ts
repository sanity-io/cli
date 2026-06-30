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
 * The mode seam for a deploy step sequence: steps report through this interface
 * and the adapter decides what a failure means, so one sequence can back more
 * than one deploy mode.
 */
export interface DeployChecks {
  add(check: DeployCheck): void
  all(): DeployCheck[]
  run<T>(
    name: string,
    fn: () => Promise<T>,
    formatError?: (err: unknown) => string,
  ): Promise<T | null>
}

/**
 * Real deploys fail fast: a fail check exits immediately, warn checks print,
 * and `run` lets errors propagate to the command's own error handling.
 */
export function createFailFastChecks(output: Output): DeployChecks {
  return {
    add(check) {
      if (check.status === 'fail') {
        output.error(check.message, {exit: check.exitCode ?? 1})
      } else if (check.status === 'warn') {
        output.warn(check.message)
      }
    },
    all() {
      return []
    },
    run(name, fn) {
      return fn()
    },
  }
}

/**
 * Aggregating checks: a fail or warn check is recorded, never exits, and a
 * throw inside `run` becomes a fail check — so one broken step never aborts
 * the rest, and every problem is reported in one pass.
 */
export function createAggregatingChecks(): DeployChecks {
  const checks: DeployCheck[] = []

  return {
    add(check) {
      checks.push(check)
    },
    all() {
      return checks
    },
    async run(name, fn, formatError = getErrorMessage) {
      try {
        return await fn()
      } catch (err) {
        deployDebug(`${name} check failed`, err)
        checks.push({message: formatError(err), name, status: 'fail'})
        return null
      }
    },
  }
}

export async function checkPackageVersion(
  checks: DeployChecks,
  {moduleName, name, workDir}: {moduleName: string; name: string; workDir: string},
): Promise<string | null> {
  const version = await getLocalPackageVersion(moduleName, workDir)
  checks.add(
    version
      ? {message: `Using ${moduleName} ${version}`, name, status: 'pass'}
      : {message: `Failed to find installed ${moduleName} version`, name, status: 'fail'},
  )
  return version
}

export function checkAutoUpdates(
  checks: DeployChecks,
  {cliConfig, flags}: {cliConfig: CliConfig; flags: DeployFlags},
): boolean {
  const {enabled, issue} = resolveAutoUpdates({cliConfig, flags})

  if (issue) {
    checks.add({
      message: getAutoUpdateIssueMessage(issue),
      name: 'auto-updates',
      // A config conflict makes a real deploy refuse to run; deprecations only warn
      status: issue.type === 'conflicting-config' ? 'fail' : 'warn',
    })

    // The deprecated top-level config also gets the styled migration edit, the
    // same second warning the build/dev path prints through shouldAutoUpdate.
    if (issue.type === 'deprecated-config') {
      checks.add({
        message: getAutoUpdateMigrationHint(cliConfig.autoUpdates),
        name: 'auto-updates',
        status: 'warn',
      })
    }
  }

  return enabled
}

export async function checkBuild(
  checks: DeployChecks,
  {
    build,
    skipReason,
    successMessage,
  }: {build: () => Promise<void>; skipReason: string | undefined; successMessage: string},
): Promise<void> {
  if (skipReason) {
    checks.add({message: skipReason, name: 'build', status: 'skip'})
    return
  }

  await checks.run(
    'build',
    async () => {
      await build()
      checks.add({message: successMessage, name: 'build', status: 'pass'})
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
  output,
  sourceDir,
}: {
  isWorkbenchApp: boolean
  output: Output
  sourceDir: string
}): Promise<void> {
  const spin = spinner('Verifying local content...').start()
  try {
    const verifyBuild = isWorkbenchApp ? checkBuiltOutput : checkDir
    await verifyBuild(sourceDir)
    spin.succeed()
  } catch (err) {
    spin.fail()
    deployDebug('Error checking directory', err)
    output.error(getErrorMessage(err), {exit: 1})
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
  checks: DeployChecks,
  {appId, organizationId}: {appId: string | undefined; organizationId: string | undefined},
): Promise<{existingApp: UserApplication | null; target: DeployTarget | null}> {
  const result = await checks.run(
    'target',
    async () => {
      const resolution = await resolveAppDeployTarget({appId, organizationId})

      switch (resolution.type) {
        case 'blocked': {
          checks.add({
            message: `Deploy target not resolved — ${resolution.message}`,
            name: 'target',
            status: 'skip',
          })
          return {existingApp: null, target: null}
        }
        case 'found': {
          const {application} = resolution
          checks.add({
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
          checks.add({message: APP_ID_NOT_FOUND_IN_ORGANIZATION, name: 'target', status: 'fail'})
          return {existingApp: null, target: null}
        }
        case 'needs-input': {
          checks.add({
            message: `No appId configured and ${resolution.existing.length} existing ${resolution.existing.length === 1 ? 'application' : 'applications'} found — deploy would prompt. Add deployment.appId to sanity.cli.ts.`,
            name: 'target',
            status: 'fail',
          })
          return {existingApp: null, target: null}
        }
        case 'would-create': {
          checks.add({
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

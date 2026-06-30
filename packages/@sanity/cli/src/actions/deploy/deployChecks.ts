import {type CliConfig, getLocalPackageVersion, type Output} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'

import {type UserApplication} from '../../services/userApplications.js'
import {
  APP_ID_NOT_FOUND_IN_ORGANIZATION,
  cannotPromptForStudioHost,
} from '../../util/errorMessages.js'
import {getErrorMessage} from '../../util/getErrorMessage.js'
import {getAutoUpdateIssueMessage, resolveAutoUpdates} from '../build/shouldAutoUpdate.js'
import {checkDir} from './checkDir.js'
import {deployDebug} from './deployDebug.js'
import {type DeployFileSummary, listDeploymentFiles} from './listDeploymentFiles.js'
import {resolveAppDeployTarget, resolveStudioDeployTarget} from './resolveDeployTarget.js'
import {type DeployFlags} from './types.js'

export type DeployCheckStatus = 'fail' | 'pass' | 'skip' | 'warn'

export interface DeployCheck {
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
  sources: {cliConfig: CliConfig; flags: DeployFlags},
): boolean {
  const {enabled, issue} = resolveAutoUpdates(sources)

  if (issue) {
    checks.add({
      message: getAutoUpdateIssueMessage(issue),
      name: 'auto-updates',
      // A config conflict makes a real deploy refuse to run; deprecations only warn
      status: issue.type === 'conflicting-config' ? 'fail' : 'warn',
    })
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
  output,
  sourceDir,
  workbench,
}: {
  output: Output
  sourceDir: string
  workbench: {checkBuiltOutput(sourceDir: string): Promise<void>} | null
}): Promise<void> {
  const spin = spinner('Verifying local content').start()
  try {
    await (workbench ? workbench.checkBuiltOutput(sourceDir) : checkDir(sourceDir))
    spin.succeed()
  } catch (err) {
    spin.fail()
    deployDebug('Error checking directory', err)
    output.error(getErrorMessage(err), {exit: 1})
  }
}

/**
 * Validates the output directory and lists the files a deploy would upload,
 * reporting through `checks` instead of a spinner.
 */
export async function checkOutputDir(
  checks: DeployChecks,
  {
    skipReason,
    sourceDir,
    workbench,
  }: {
    skipReason?: string
    sourceDir: string
    workbench: {checkBuiltOutput(sourceDir: string): Promise<void>} | null
  },
): Promise<DeployFileSummary | null> {
  if (skipReason) {
    checks.add({message: skipReason, name: 'output-dir', status: 'skip'})
    return null
  }

  return checks.run('output-dir', async () => {
    await (workbench ? workbench.checkBuiltOutput(sourceDir) : checkDir(sourceDir))
    checks.add({message: `Output directory: ${sourceDir}`, name: 'output-dir', status: 'pass'})
    const list = await listDeploymentFiles(sourceDir)
    return {
      count: list.length,
      list,
      totalBytes: list.reduce((total, file) => total + file.size, 0),
    }
  })
}

export interface DeployTarget {
  /** User application id when the deploy targets an existing application */
  appId: string | null
  /** Whether the target application already exists (false means deploy would create it) */
  exists: boolean
  /** Studio hostname or external URL */
  host: string | null
  type: 'coreApp' | 'studio' | 'studio-external'
}

/**
 * Maps the read-only studio deploy-target verdict to a check and a target
 * descriptor. The rules live in resolveDeployTarget; a real deploy consumes the
 * same verdicts through findUserApplicationForStudio.
 */
export async function checkStudioTarget(
  checks: DeployChecks,
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
): Promise<DeployTarget | null> {
  const type = isExternal ? 'studio-external' : 'studio'
  const studioUrl = (host: string) => (isExternal ? host : `https://${host}.sanity.studio`)

  return checks.run(
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
          checks.add({
            message: `Deploy target not resolved — ${resolution.message}`,
            name: 'target',
            status: 'skip',
          })
          return null
        }
        case 'found': {
          const {application} = resolution
          checks.add({
            message: `Deploys to existing studio ${studioUrl(application.appHost)}`,
            name: 'target',
            status: 'pass',
          })
          return {appId: application.id, exists: true, host: application.appHost, type}
        }
        case 'invalid': {
          checks.add({message: resolution.message, name: 'target', status: 'fail'})
          return null
        }
        case 'needs-input': {
          // The same constraint an unattended deploy enforces, with the same message
          checks.add({
            message: cannotPromptForStudioHost(isExternal),
            name: 'target',
            status: 'fail',
          })
          return null
        }
        case 'would-create': {
          const {appHost} = resolution
          checks.add({
            message: isExternal
              ? `Would register external studio at ${appHost}`
              : `Would create studio hostname ${studioUrl(appHost)} (name availability is checked on deploy)`,
            name: 'target',
            status: 'pass',
          })
          return {appId: null, exists: false, host: appHost, type}
        }
      }
    },
    (err) => `Failed to resolve deploy target: ${getErrorMessage(err)}`,
  )
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
            target: {appId: null, exists: false, host: null, type: 'coreApp' as const},
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

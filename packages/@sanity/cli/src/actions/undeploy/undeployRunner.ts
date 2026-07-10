import {styleText} from 'node:util'

import {CLIError} from '@oclif/core/errors'
import {type Output, subdebug} from '@sanity/cli-core'
import {
  type CheckReporter,
  createCollectingReporter,
  createFailFastReporter,
} from '@sanity/cli-core/checks'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {confirm, spinner} from '@sanity/cli-core/ux'

import {
  type UndeployAdapter,
  type UndeployOptions,
  type UndeployTarget,
  type UndeployTargetResolution,
} from './types.js'
import {describeUndeployTarget, renderUndeployPlan, type UndeployPlan} from './undeployPlan.js'

const undeployDebug = subdebug('undeploy')

/**
 * Runs an undeploy in the mode the flags select: a real undeploy fails fast,
 * confirms, and deletes; `--dry-run` drives the same target resolution
 * read-only and renders a plan instead.
 */
export async function runUndeploy(
  options: UndeployOptions,
  adapter: UndeployAdapter,
): Promise<void> {
  const {flags, output} = options

  try {
    if (flags['dry-run']) {
      const plan = await collectUndeployPlan(adapter)
      renderUndeployPlan(plan, output)
      exitIfBlocked(plan, output)
      return
    }

    await performUndeploy(options, adapter)
  } catch (error) {
    const failure = normalizeFailure(error, adapter.type)
    output.error(failure.message, {exit: failure.exit})
  }
}

async function performUndeploy(options: UndeployOptions, adapter: UndeployAdapter): Promise<void> {
  const {flags, output} = options

  const resolution = await resolveTarget(adapter, createFailFastReporter(output))
  // A resolve failure never lands here: the fail-fast reporter already exited.
  if (!resolution) return
  if (resolution.type === 'none') {
    printNothingToUndeploy(resolution, output)
    return
  }

  const {target} = resolution
  if (!flags.yes) {
    const shouldUndeploy = await confirm({
      default: false,
      message: confirmUndeployMessage(target),
    })
    if (!shouldUndeploy) return
  }

  const spin = spinner(
    `Undeploying ${adapter.type === 'coreApp' ? 'application' : 'studio'}`,
  ).start()
  try {
    await adapter.undeploy(target)
  } catch (error) {
    spin.fail()
    throw error
  }
  spin.succeed()

  printUndeployScheduled(target, output)
}

/** Runs the target resolution read-only and gathers the plan a dry run reports. */
async function collectUndeployPlan(adapter: UndeployAdapter): Promise<UndeployPlan> {
  const reporter = createCollectingReporter()
  const resolution = await resolveTarget(adapter, reporter)
  return {
    checks: reporter.results,
    target: resolution?.type === 'found' ? resolution.target : null,
    type: adapter.type,
  }
}

/**
 * Resolves the undeploy target and reports the verdict as a check, shared by
 * both modes so a real run and a dry run can't diverge.
 */
async function resolveTarget(
  adapter: UndeployAdapter,
  reporter: CheckReporter,
): Promise<UndeployTargetResolution | null> {
  const spin = spinner('Checking application info').start()

  let resolution: UndeployTargetResolution
  try {
    resolution = await adapter.resolveTarget()
  } catch (error) {
    spin.fail()
    undeployDebug('Failed to resolve undeploy target', error)
    reporter.report({
      message: `Failed to resolve undeploy target: ${getErrorMessage(error)}`,
      status: 'fail',
    })
    return null
  }

  spin[resolution.type === 'found' ? 'succeed' : 'fail']()
  reporter.report(describeUndeployTarget(resolution))
  return resolution
}

/** Exits like a real (fail-fast) undeploy would, on the first failing check's exit code. */
function exitIfBlocked(plan: UndeployPlan, output: Output): void {
  const failed = plan.checks.find((check) => check.status === 'fail')
  if (!failed) return
  output.error('Undeploy blocked by failing checks.', {exit: failed.exitCode ?? 1})
}

function printNothingToUndeploy(
  resolution: {message: string; solution?: string},
  output: Output,
): void {
  output.log(`${resolution.message}.`)
  if (resolution.solution) output.log(`${resolution.solution}.`)
  output.log('Nothing to undeploy.')
}

function confirmUndeployMessage(target: UndeployTarget): string {
  if (target.applicationType === 'coreApp') {
    return `This will undeploy the following application:

    Title: ${styleText('yellow', target.title || '(untitled application)')}
    ID:    ${styleText('yellow', target.applicationId)}

The application will no longer be available for any of your users if you proceed.

Are you ${styleText('red', 'sure')} you want to undeploy?`
  }

  return `This will undeploy ${styleText('yellow', target.url ?? target.applicationId)} and make it unavailable for your users.
The hostname will be available for anyone to claim.
Are you ${styleText('red', 'sure')} you want to undeploy?`
}

function printUndeployScheduled(target: UndeployTarget, output: Output): void {
  if (target.applicationType === 'coreApp') {
    output.log(
      `\n${styleText('bold', '⏱️ Application undeploy scheduled.')} It might be a few minutes until ${
        target.title ? styleText('italic', `'${target.title}'`) : 'your application'
      } is unavailable.`,
    )
    output.log(
      `\n${styleText('bold', 'Remember to remove `deployment.appId` from your application configuration')} to avoid errors when redeploying.`,
    )
    return
  }

  output.log(
    `\nStudio undeploy scheduled. It might be a few minutes until ${target.url ?? 'your studio'} is unavailable.`,
  )
}

/** The one failure diagnosis the stderr message reads. */
function normalizeFailure(
  error: unknown,
  type: UndeployAdapter['type'],
): {exit: number; message: string} {
  // Ctrl+C on the confirmation prompt isn't a real failure
  if (error instanceof Error && error.name === 'ExitPromptError') {
    return {exit: 1, message: 'Undeploy cancelled by user'}
  }
  // A failed check already carries its own message and exit code
  if (error instanceof CLIError) {
    return {exit: error.oclif?.exit ?? 1, message: error.message}
  }
  const label = type === 'coreApp' ? 'application' : 'studio'
  undeployDebug(`Error undeploying ${label}`, error)
  return {exit: 1, message: `Error undeploying ${label}: ${getErrorMessage(error)}`}
}

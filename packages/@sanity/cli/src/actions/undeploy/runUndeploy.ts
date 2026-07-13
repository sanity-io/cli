import {styleText} from 'node:util'

import {CLIError} from '@oclif/core/errors'
import {exitCodes, type Output, subdebug} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {confirm, spinner} from '@sanity/cli-core/ux'

import {type UndeployCommand} from '../../commands/undeploy.js'
import {
  type CheckReporter,
  createCollectingReporter,
  createFailFastReporter,
} from '../../util/checks.js'
import {toStderrOutput} from '../../util/toStderrOutput.js'
import {
  describeUndeployTarget,
  renderUndeployPlan,
  type UndeployPlan,
  undeployPlanToJson,
  type UndeployTarget,
  type UndeployTargetResolution,
} from './undeployPlan.js'

const undeployDebug = subdebug('undeploy')

type UndeployFlags = UndeployCommand['flags']

export interface UndeployOptions {
  flags: UndeployFlags
  isUnattended: boolean
  output: Output
}

/**
 * The parts of an undeploy that differ per application backend. The shared
 * sequence — mode selection, target reporting, confirmation, error handling —
 * lives in `runUndeploy`; adapters only resolve and delete.
 */
export interface UndeployAdapter {
  /** Resolves what an undeploy would delete; read-only. */
  resolveTarget(): Promise<UndeployTargetResolution>
  type: 'coreApp' | 'studio'
  /** Deletes the target — the only mutating step, never run on a dry run. */
  undeploy(target: UndeployTarget): Promise<void>
}

/** What a real undeploy produced — the payload `--json` reports. */
type UndeployResult =
  | {application: UndeployTarget; undeployed: true}
  | {reason: string; undeployed: false}

/**
 * Runs an undeploy in the mode the flags select: a real undeploy fails fast,
 * confirms, and deletes; `--dry-run` drives the same target resolution
 * read-only and renders a plan instead. `--json` emits the same information as
 * machine-readable JSON.
 */
export async function runUndeploy(
  options: UndeployOptions,
  adapter: UndeployAdapter,
): Promise<void> {
  const {flags, output} = options
  const json = !!flags.json
  const emitJson = (payload: unknown) => output.log(JSON.stringify(payload, null, 2))

  // The JSON payload owns stdout, so the run's progress logs go to stderr; only
  // the final JSON.stringify writes to stdout.
  const runOptions = json ? {...options, output: toStderrOutput(output)} : options

  try {
    if (flags['dry-run']) {
      const reporter = createCollectingReporter()
      const resolution = await resolveTarget(adapter, reporter)
      const plan: UndeployPlan = {
        checks: reporter.results,
        reason: resolution?.type === 'none' ? resolution.message : null,
        target: resolution?.type === 'found' ? resolution.target : null,
        type: adapter.type,
      }
      if (json) emitJson(undeployPlanToJson(plan))
      else renderUndeployPlan(plan, output)
      // A blocked plan exits like a real (fail-fast) undeploy would.
      const failed = plan.checks.find((check) => check.status === 'fail')
      if (failed) output.error('Undeploy blocked by failing checks.', {exit: failed.exitCode ?? 1})
      return
    }

    const result = await undeployApp(runOptions, adapter)
    if (json && result) emitJson(result)
  } catch (error) {
    const failure = normalizeFailure(error, adapter.type)
    // A blocked dry run reaches this catch too (its exit throws) and already
    // printed its plan, so only a real undeploy adds the {undeployed: false} envelope.
    if (json && !flags['dry-run']) {
      emitJson({error: {message: failure.message}, undeployed: false})
    }
    output.error(failure.message, {exit: failure.exit})
  }
}

/** The real run: resolve the target, confirm, delete, report. */
async function undeployApp(
  options: UndeployOptions,
  adapter: UndeployAdapter,
): Promise<UndeployResult | undefined> {
  const {flags, output} = options

  const resolution = await resolveTarget(adapter, createFailFastReporter(output))
  // A resolve failure never lands here: the fail-fast reporter already exited.
  if (!resolution) return undefined
  if (resolution.type === 'none') {
    output.log(`${resolution.message}.`)
    if (resolution.solution) output.log(`${resolution.solution}.`)
    output.log('Nothing to undeploy.')
    return {reason: resolution.message, undeployed: false}
  }

  const {target} = resolution
  if (!flags.yes && options.isUnattended) {
    throw new CLIError('Undeploy requires confirmation. Pass --yes to continue.', {
      exit: exitCodes.USAGE_ERROR,
    })
  }

  if (!flags.yes) {
    const shouldUndeploy = await confirm({
      default: false,
      message: confirmUndeployMessage(target),
    })
    if (!shouldUndeploy) {
      throw new CLIError('Undeploy cancelled', {exit: exitCodes.USER_ABORT})
    }
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
  return {application: target, undeployed: true}
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

function confirmUndeployMessage(target: UndeployTarget): string {
  if (target.type === 'coreApp') {
    return `This will undeploy the following application:

    Title: ${styleText('yellow', target.title || '(untitled application)')}
    ID:    ${styleText('yellow', target.id)}

The application will no longer be available for any of your users if you proceed.

Are you ${styleText('red', 'sure')} you want to undeploy?`
  }

  return `This will undeploy ${styleText('yellow', target.url ?? target.id)} and make it unavailable for your users.
Are you ${styleText('red', 'sure')} you want to undeploy?`
}

function printUndeployScheduled(target: UndeployTarget, output: Output): void {
  if (target.type === 'coreApp') {
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

/** The one failure diagnosis both the stderr message and the `--json` envelope read. */
function normalizeFailure(
  error: unknown,
  type: UndeployAdapter['type'],
): {exit: number; message: string} {
  // Ctrl+C on the confirmation prompt isn't a real failure
  if (error instanceof Error && error.name === 'ExitPromptError') {
    return {exit: exitCodes.USER_ABORT, message: 'Undeploy cancelled'}
  }
  // A failed check already carries its own message and exit code
  if (error instanceof CLIError) {
    return {exit: error.oclif?.exit ?? 1, message: error.message}
  }
  const label = type === 'coreApp' ? 'application' : 'studio'
  undeployDebug(`Error undeploying ${label}`, error)
  return {exit: 1, message: `Error undeploying ${label}: ${getErrorMessage(error)}`}
}

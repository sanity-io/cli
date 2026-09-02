import {CLIError} from '@oclif/core/errors'
import {exitCodes, type Output} from '@sanity/cli-core'
import {getErrorMessage} from '@sanity/cli-core/errors'
import {type WorkbenchDeployPayload} from '@sanity/workbench-cli/deploy'

import {createCollectingReporter, createFailFastReporter} from '../../util/checks.js'
import {toStderrOutput} from '../../util/toStderrOutput.js'
import {type DeployCheck, type DeployCheckReporter, type DeployTarget} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {
  type DeploymentFile,
  type DeploymentPlan,
  deploymentPlanToJson,
  isDeployable,
  renderDeploymentPlan,
} from './deploymentPlan.js'
import {type DeployAppOptions} from './types.js'

export interface DeployResult {
  application: object | null
  payload: DeployPayload

  action?: DeployTarget['action']
  /** Resolved server-side, so it stays out of the local payload. */
  installationId?: string
  url?: string | null
}

/** Collected locally, so a dry run reports it too. */
export interface DeployPayload extends Partial<WorkbenchDeployPayload> {
  /** The configured `deployment.appId`; `null` when the deploy would mint one. */
  appId: string | null
  isAutoUpdating: boolean
  type: 'coreApp' | 'studio'
  version: string | null

  organizationId?: string
  projectId?: string
}

/**
 * The parts of a deploy that differ between core apps and studios. The shared
 * sequence — mode selection, error handling, the dry-run plan, `--json` — lives
 * in `runDeploy`.
 */
export interface DeploySpec {
  /** Files a real deploy would upload, listed only for the dry-run plan. */
  listFiles: (options: DeployAppOptions) => Promise<DeploymentFile[]>
  /** The step sequence; every step reports through `reporter`. */
  run: (options: DeployAppOptions, reporter: DeployCheckReporter) => Promise<DeployResult | void>
  type: 'coreApp' | 'studio'
}

/**
 * Runs a deploy in the mode the flags select: a real deploy fails fast and
 * mutates, `--dry-run` drives the same `run` sequence read-only and renders a
 * plan, and `--json` emits the same information as machine-readable JSON.
 */
export async function runDeploy(options: DeployAppOptions, spec: DeploySpec): Promise<void> {
  const {output} = options
  const json = !!options.flags.json
  const emitJson = (payload: unknown) => output.log(JSON.stringify(payload, null, 2))

  // The JSON payload owns stdout, so the run's progress logs go to stderr; only
  // the final JSON.stringify writes to stdout.
  const runOptions = json ? {...options, output: toStderrOutput(output)} : options

  try {
    if (options.flags['dry-run']) {
      const plan = await collectPlan(runOptions, spec)
      if (json) emitJson(deploymentPlanToJson(plan))
      else renderDeploymentPlan(plan, output)
      exitIfBlocked(plan, output)
      return
    }

    const result = await spec.run(runOptions, createFailFastReporter(runOptions.output))
    if (json && result) emitJson({deployed: true, reason: null, ...result})
  } catch (error) {
    const failure = normalizeFailure(error, spec.type)
    // A blocked dry run reaches this catch too (its exit throws) and already
    // printed its plan, so only a real deploy adds the {deployed: false} envelope.
    if (json && !options.flags['dry-run']) {
      emitJson({
        application: null,
        deployed: false,
        error: {message: failure.message},
        payload: null,
        reason: failure.message,
      })
    }
    output.error(failure.message, {exit: failure.exit})
  }
}

/** Runs the step sequence read-only and gathers the plan a dry run reports. */
async function collectPlan(options: DeployAppOptions, spec: DeploySpec): Promise<DeploymentPlan> {
  const reporter = createCollectingReporter<DeployCheck>()
  const result = await spec.run(options, reporter)
  const plan: DeploymentPlan = {
    checks: reporter.results,
    files: [],
    payload: result?.payload ?? null,
    target:
      reporter.results.find((check) => check.target && check.status !== 'fail')?.target ?? null,
    type: spec.type,
  }
  // A blocked deploy uploads nothing, so only enumerate files for a deployable plan.
  if (isDeployable(plan)) plan.files = await spec.listFiles(options)
  return plan
}

/** Exits like a real (fail-fast) deploy would, on the first failing check's exit code. */
function exitIfBlocked(plan: DeploymentPlan, output: Output): void {
  if (isDeployable(plan)) return
  const failed = plan.checks.find((check) => check.status === 'fail')
  output.error('Deploy blocked by failing checks.', {exit: failed?.exitCode ?? 1})
}

/** The one failure diagnosis both the stderr message and the `--json` envelope read. */
function normalizeFailure(
  error: unknown,
  type: 'coreApp' | 'studio',
): {exit: number; message: string} {
  // Ctrl+C on an interactive prompt isn't a real failure
  if (error instanceof Error && error.name === 'ExitPromptError') {
    return {exit: exitCodes.RUNTIME_ERROR, message: 'Deployment cancelled by user'}
  }
  // A failed check already carries its own message and exit code
  if (error instanceof CLIError) {
    return {exit: error.oclif?.exit ?? 1, message: error.message}
  }
  deployDebug(`Error deploying ${type === 'coreApp' ? 'application' : 'studio'}`, error)
  return {
    exit: exitCodes.RUNTIME_ERROR,
    message: `Error deploying ${type === 'coreApp' ? 'application' : 'studio'}: ${getErrorMessage(error)}`,
  }
}

import {CLIError} from '@oclif/core/errors'
import {type Output} from '@sanity/cli-core'

import {
  type CheckReporter,
  createCollectingReporter,
  createFailFastReporter,
} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {type DeploymentFile, renderDeploymentPlan} from './deploymentPlan.js'
import {type DeployAppOptions} from './types.js'

/**
 * The parts of a deploy that differ between core apps and studios. The shared
 * sequence — mode selection, error handling, the dry-run plan — lives in `runDeploy`.
 */
export interface DeploySpec {
  /** Files a real deploy would upload, listed only for the dry-run plan. */
  listFiles: (options: DeployAppOptions) => Promise<DeploymentFile[]>
  /** The step sequence; every step reports through `reporter`. */
  run: (options: DeployAppOptions, reporter: CheckReporter) => Promise<void>
  type: 'coreApp' | 'studio'
}

/**
 * Runs a deploy in the mode the flags select. A real deploy fails fast and
 * mutates; `--dry-run` drives the same `run` sequence read-only and renders a
 * plan. The mode lives only in the reporter, so the two can't drift.
 */
export async function runDeploy(options: DeployAppOptions, spec: DeploySpec): Promise<void> {
  const {output} = options

  if (options.flags['dry-run']) {
    const reporter = createCollectingReporter()
    await spec.run(options, reporter)
    const files = await spec.listFiles(options)
    renderDeploymentPlan({checks: reporter.results, files, type: spec.type}, output)
    // Exit non-zero when the plan isn't deployable so scripts can gate on it.
    if (reporter.results.some((check) => check.status === 'fail')) {
      output.error('Deploy blocked by failing checks.', {exit: 1})
    }
    return
  }

  try {
    await spec.run(options, createFailFastReporter(output))
  } catch (error) {
    normalizeDeployError(error, output, spec.type)
  }
}

function normalizeDeployError(error: unknown, output: Output, type: 'coreApp' | 'studio'): void {
  const noun = type === 'coreApp' ? 'application' : 'studio'

  // Ctrl+C on an interactive prompt isn't a real failure
  if (error instanceof Error && error.name === 'ExitPromptError') {
    output.error('Deployment cancelled by user', {exit: 1})
    return
  }
  // A failed check already carries its own exit code; keep it
  if (error instanceof CLIError) {
    output.error(error.message, {exit: error.oclif?.exit ?? 1})
    return
  }
  deployDebug(`Error deploying ${noun}`, error)
  output.error(`Error deploying ${noun}: ${error}`, {exit: 1})
}

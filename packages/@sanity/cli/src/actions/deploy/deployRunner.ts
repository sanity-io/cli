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
 * A deploy flow, split into the parts that differ between core apps and studios.
 * Everything the two share — mode selection, error handling, the dry-run plan —
 * lives in `runDeploy`, so both types read as the same sequence.
 */
export interface DeploySpec {
  /** Files a real deploy would upload, listed only for the dry-run plan. */
  listFiles: (options: DeployAppOptions) => Promise<DeploymentFile[]>
  /** The step sequence; every step reports through `reporter`. */
  run: (options: DeployAppOptions, reporter: CheckReporter) => Promise<void>
  type: 'coreApp' | 'studio'
}

/**
 * Runs a deploy flow in whichever mode the flags select. A real deploy fails
 * fast and mutates; `--dry-run` collects every check and renders a plan without
 * mutating. Both drive the same `run` sequence, so the modes can't drift — the
 * mode lives only in the reporter and in the dry-run stop inside `run`.
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

import {format} from 'node:util'

import {CLIError} from '@oclif/core/errors'
import {type Output} from '@sanity/cli-core'
import {type DeployedExpose} from '@sanity/workbench-cli/deploy'

import {
  type CheckReporter,
  createCollectingReporter,
  createFailFastReporter,
  type DeployTarget,
} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {
  type DeploymentFile,
  type DeploymentPlan,
  deploymentPlanToJson,
  isDeployable,
  renderDeploymentPlan,
} from './deploymentPlan.js'
import {type DeployAppOptions} from './types.js'

/** What a real deploy produced — the payload `--json` reports. */
export interface DeployResult {
  applicationType: 'coreApp' | 'studio'
  /** Installed framework version the deploy used (`sanity` or `@sanity/sdk-react`). */
  applicationVersion: string
  /**
   * The deployed application/studio, in the same shape the dry-run plan reports
   * so the two modes can't drift; `null` for a config-only singleton deploy.
   */
  target: DeployTarget | null

  /** Workbench views and services registered with the deploy. */
  exposes?: DeployedExpose[]
  /** Media-library installation config summary, when a singleton config deployed. */
  installationConfig?: string
  /** Set when a media-library singleton deployed its installation config. */
  installationId?: string
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
  run: (options: DeployAppOptions, reporter: CheckReporter) => Promise<DeployResult | void>
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

  // The JSON payload owns stdout, so the run's progress logs go to stderr; only
  // the final JSON.stringify writes to stdout. Spinners are already on stderr.
  const runOptions = json
    ? {
        ...options,
        output: {
          ...output,
          log: (message = '', ...args: unknown[]) =>
            void process.stderr.write(`${format(message, ...args)}\n`),
        },
      }
    : options

  try {
    if (options.flags['dry-run']) {
      const plan = await collectPlan(runOptions, spec)
      if (json) output.log(JSON.stringify(deploymentPlanToJson(plan), null, 2))
      else renderDeploymentPlan(plan, output)
      exitIfBlocked(plan, output)
      return
    }

    const result = await spec.run(runOptions, createFailFastReporter(runOptions.output))
    if (json && result) output.log(JSON.stringify({deployed: true, ...result}, null, 2))
  } catch (error) {
    // Failures signal via exit code and stderr, like every other command — no JSON on stdout.
    normalizeDeployError(error, output, spec.type)
  }
}

/** Runs the step sequence read-only and gathers the plan a dry run reports. */
async function collectPlan(options: DeployAppOptions, spec: DeploySpec): Promise<DeploymentPlan> {
  const reporter = createCollectingReporter()
  await spec.run(options, reporter)
  const plan: DeploymentPlan = {
    checks: reporter.results,
    exposes: reporter.results.find((check) => check.exposes)?.exposes ?? [],
    files: [],
    installationConfig:
      reporter.results.find((check) => check.installationConfig)?.installationConfig ?? null,
    target: reporter.results.find((check) => check.target)?.target ?? null,
    type: spec.type,
    version: reporter.results.find((check) => check.version)?.version ?? null,
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

function normalizeDeployError(error: unknown, output: Output, type: 'coreApp' | 'studio'): void {
  const noun = type === 'coreApp' ? 'application' : 'studio'

  // Ctrl+C on an interactive prompt isn't a real failure
  if (error instanceof Error && error.name === 'ExitPromptError') {
    output.error('Deployment cancelled by user', {exit: 1})
    return
  }
  // A failed check already carries its own message and exit code; rethrow untouched
  if (error instanceof CLIError) throw error
  deployDebug(`Error deploying ${noun}`, error)
  output.error(`Error deploying ${noun}: ${error}`, {exit: 1})
}

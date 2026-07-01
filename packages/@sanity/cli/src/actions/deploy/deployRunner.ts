import {CLIError} from '@oclif/core/errors'
import {type Output} from '@sanity/cli-core'

import {type CheckReporter, createFailFastReporter} from './deployChecks.js'
import {deployDebug} from './deployDebug.js'
import {type DeployAppOptions} from './types.js'

/**
 * A deploy flow, split into the parts that differ between core apps and studios.
 * Everything the two share — reporter setup and error handling — lives in
 * `runDeploy`, so both types read as the same sequence.
 */
export interface DeploySpec {
  /** The step sequence; every step reports through `reporter`. */
  run: (options: DeployAppOptions, reporter: CheckReporter) => Promise<void>
  type: 'coreApp' | 'studio'
}

/**
 * Runs a deploy flow: the steps report through a fail-fast reporter — the first
 * failure prints and exits — and any escaping error is normalized to an exit
 * code.
 */
export async function runDeploy(options: DeployAppOptions, spec: DeploySpec): Promise<void> {
  const {output} = options

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

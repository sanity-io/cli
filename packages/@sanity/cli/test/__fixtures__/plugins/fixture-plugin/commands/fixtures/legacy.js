import {Command} from '@oclif/core'

/**
 * Extends oclif's `Command` rather than `SanityCommand`, so it has no
 * `runInExecutionContext` and cannot honour the execution context's output
 * sinks, token, or project-discovery guards — regardless of the `allow` its
 * plugin declares for it.
 */
export default class FixtureLegacy extends Command {
  static args = {}
  static description = 'Command that cannot run in an execution context'
  static flags = {}

  async run() {
    this.log('fixture legacy')
  }
}

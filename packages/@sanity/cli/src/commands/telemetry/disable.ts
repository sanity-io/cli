import {Command} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {SanityCommand} from '@sanity/cli-core'

import {setConsent} from '../../actions/telemetry/setConsent.js'
import {telemetryLearnMoreMessage} from '../../actions/telemetry/telemetryLearnMoreMessage.js'

export class Disable extends SanityCommand<typeof Disable> {
  static override description = 'Disable telemetry for your logged in user'

  static override examples: Array<Command.Example> = [
    {
      command: '<%= config.bin %> telemetry <%= command.id %>',
      description: 'Disable telemetry for your logged in user',
    },
  ]

  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(Disable)

    try {
      const result = await setConsent({
        env: process.env,
        status: 'denied',
      })

      this.log(result.message)

      if (result.changed) {
        this.log(`\n${telemetryLearnMoreMessage('denied')}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred'
      this.error(message, {exit: 1})
    }
  }
}

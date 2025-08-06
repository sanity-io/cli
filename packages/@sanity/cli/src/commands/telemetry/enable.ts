import {Command} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {SanityCommand} from '@sanity/cli-core'

import {setConsent} from '../../actions/telemetry/setConsent.js'
import {telemetryLearnMoreMessage} from '../../actions/telemetry/telemetryLearnMoreMessage.js'

export class Enable extends SanityCommand<typeof Enable> {
  static override description = 'Enable telemetry for your logged in user'

  static override examples: Array<Command.Example> = [
    {
      command: '<%= config.bin %> telemetry <%= command.id %>',
      description: 'Enable telemetry for your logged in user',
    },
  ]

  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(Enable)

    try {
      const result = await setConsent({
        env: process.env,
        status: 'granted',
      })

      this.log(result.message)

      if (result.changed) {
        this.log(`\n${telemetryLearnMoreMessage('granted')}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred'
      this.error(message, {exit: 1})
    }
  }
}

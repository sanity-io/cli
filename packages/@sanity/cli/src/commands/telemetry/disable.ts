import {Command} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {exitCodes, SanityCommand} from '@sanity/cli-core'

import {setConsent} from '../../actions/telemetry/setConsent.js'
import {telemetryLearnMoreMessage} from '../../actions/telemetry/telemetryLearnMoreMessage.js'

export class Disable extends SanityCommand<typeof Disable> {
  static override description = 'Disable telemetry for your account'

  static override examples: Array<Command.Example> = [
    {
      command: '<%= config.bin %> telemetry <%= command.id %>',
      description: 'Disable telemetry for your account',
    },
  ]

  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(Disable)

    try {
      const result = await setConsent({
        status: 'denied',
      })

      this.output.log(result.message)

      if (result.changed) {
        this.output.log(`\n${telemetryLearnMoreMessage('denied')}`)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred'
      this.output.error(message, {exit: exitCodes.RUNTIME_ERROR})
    }
  }
}

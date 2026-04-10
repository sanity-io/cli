import {Command} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {SanityCommand} from '@sanity/cli-core'

import {getLearnMoreMessage} from '../../actions/telemetry/getLearnMoreMessage.js'
import {getStatusMessage} from '../../actions/telemetry/getStatusMessage.js'
import {resolveConsent} from '../../actions/telemetry/resolveConsent.js'

export class Status extends SanityCommand<typeof Status> {
  static override description = 'Check telemetry status for your account'

  static override examples: Array<Command.Example> = [
    {
      command: '<%= config.bin %> telemetry <%= command.id %>',
      description: 'Check telemetry status for your account',
    },
  ]

  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(Status)

    const consentInfo = await resolveConsent()

    const statusMessage = getStatusMessage(consentInfo)
    const learnMoreMessage = getLearnMoreMessage(consentInfo.status)

    this.log(statusMessage)
    this.log(`\n${learnMoreMessage}`)
  }
}

import {Command} from '@oclif/core'
import {type FlagInput} from '@oclif/core/interfaces'
import {SanityCommand} from '@sanity/cli-core'

import {resolveConsent} from '../../actions/telemetry/resolveConsent.js'
import {type ConsentInformation} from '../../actions/telemetry/types.js'

function getStatusDisplay(status: ConsentInformation['status']): string {
  switch (status) {
    case 'denied': {
      return 'Disabled'
    }
    case 'granted': {
      return 'Enabled'
    }
    case 'undetermined': {
      return 'Undetermined'
    }
    case 'unset': {
      return 'Not set'
    }
    default: {
      return 'Unknown'
    }
  }
}

function getStatusMessage(consentInfo: ConsentInformation): string {
  const {reason, status} = consentInfo

  switch (true) {
    case status === 'undetermined' && reason === 'unauthenticated': {
      return 'You need to log in first to see telemetry status.'
    }

    case status === 'undetermined' && reason === 'fetchError': {
      return 'Could not fetch telemetry consent status.'
    }

    case status === 'denied' && reason === 'localOverride': {
      return `Status: ${getStatusDisplay(status)}\n\nYou've opted out of telemetry data collection.\nNo data will be collected from your machine.\n\nUsing DO_NOT_TRACK environment variable.`
    }

    case status === 'denied': {
      return `Status: ${getStatusDisplay(status)}\n\nYou've opted out of telemetry data collection.\nNo data will be collected from your Sanity account.`
    }

    case status === 'granted': {
      return `Status: ${getStatusDisplay(status)}\n\nTelemetry data on general usage and errors is collected to help us improve Sanity.`
    }

    case status === 'unset': {
      return `Status: ${getStatusDisplay(status)}\n\nYou've not set your preference for telemetry collection.\n\nRun 'npx sanity telemetry enable/disable' to opt in or out.\nYou can also use the DO_NOT_TRACK environment variable to opt out.`
    }

    default: {
      return `Status: ${getStatusDisplay(status)}`
    }
  }
}

function getLearnMoreMessage(status: ConsentInformation['status']): string {
  const url = 'https://www.sanity.io/telemetry'

  switch (status) {
    case 'granted': {
      return `Learn more about the data being collected here:\n${url}`
    }
    default: {
      return `Learn more here:\n${url}`
    }
  }
}

export class Status extends SanityCommand<typeof Status> {
  static override description = 'Check telemetry consent status for your logged in user'

  static override examples: Array<Command.Example> = [
    {
      command: '<%= config.bin %> telemetry <%= command.id %>',
      description: 'Check telemetry consent status for your logged in user',
    },
  ]

  static override flags = {} satisfies FlagInput

  public async run(): Promise<void> {
    // Parse to ensure no invalid flags are passed
    await this.parse(Status)

    const consentInfo = await resolveConsent({env: process.env})

    console.log({consentInfo})

    const statusMessage = getStatusMessage(consentInfo)
    const learnMoreMessage = getLearnMoreMessage(consentInfo.status)

    this.log(statusMessage)
    this.log(`\n${learnMoreMessage}`)
  }
}

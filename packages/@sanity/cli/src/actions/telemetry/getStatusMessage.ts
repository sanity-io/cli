import {type ConsentInformation} from '@sanity/cli-core'

import {getStatusDisplay} from './getStatusDisplay.js'

export function getStatusMessage(consentInfo: ConsentInformation): string {
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

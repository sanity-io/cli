import {type ConsentStatus} from '@sanity/telemetry'

export function telemetryLearnMoreMessage(status: ConsentStatus): string {
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

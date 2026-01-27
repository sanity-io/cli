import {type ConsentInformation} from '@sanity/cli-core'

export function getStatusDisplay(status: ConsentInformation['status']): string {
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

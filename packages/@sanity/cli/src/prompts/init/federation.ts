import {confirm} from '@sanity/cli-core/ux'

export function promptForFederation(): Promise<boolean> {
  return confirm({
    default: true,
    message: 'Would you like to enable federation for this project?',
  })
}

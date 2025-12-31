import {confirm} from '@sanity/cli-core/ux'

export function promptForDefaultConfig(): Promise<boolean> {
  return confirm({
    default: true,
    message: 'Use the default dataset configuration?',
  })
}

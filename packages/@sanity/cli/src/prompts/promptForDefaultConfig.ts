import {Output} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'

export const DATASET_INFO_TEXT =
  'Your content will be stored in a dataset that can be public or private, depending on\n' +
  'whether you want to query your content with or without authentication.\n' +
  'The default dataset configuration has a public dataset named "production".'

export function promptForDefaultConfig(output: Output): Promise<boolean> {
  output.log(DATASET_INFO_TEXT)
  return confirm({
    default: true,
    message: 'Use the default dataset configuration?',
  })
}

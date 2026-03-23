import {confirm} from '@sanity/cli-core/ux'

const DATASET_INFO_TEXT =
  'Your content will be stored in a dataset that can be public or private, depending on\n' +
  'whether you want to query your content with or without authentication.\n' +
  'The default dataset configuration has a public dataset named "production".'

export function promptForDefaultConfig(): Promise<boolean> {
  console.log(DATASET_INFO_TEXT)
  return confirm({
    default: true,
    message: 'Use the default dataset configuration?',
  })
}

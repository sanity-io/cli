import {select} from '@sanity/cli-core/ux'

export function selectDataset(
  datasets: string[],
  options: {
    message?: string
  } = {},
): Promise<string> {
  return select({
    choices: datasets.map((name) => ({name, value: name})),
    message: options.message || 'Select target dataset:',
  })
}

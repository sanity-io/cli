import {select} from '@inquirer/prompts'

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

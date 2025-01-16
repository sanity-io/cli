import {debug} from '../../debug.js'
import type {CliCommandContext} from '../../types.js'
import {promptForDatasetName} from './datasetNamePrompt.js'

export async function chooseDatasetPrompt(
  context: CliCommandContext,
  options: {message?: string; allowCreation?: boolean} = {},
): Promise<string> {
  const {apiClient, prompt} = context
  const {message, allowCreation} = options
  const client = apiClient()

  const datasets = await client.datasets.list()
  const hasProduction = datasets.find((dataset) => dataset.name === 'production')
  const datasetChoices = datasets.map((dataset) => ({value: dataset.name}))
  const selected = await prompt.single({
    message: message || 'Select dataset to use',
    type: 'list',
    choices: allowCreation
      ? [{value: 'new', name: 'Create new dataset'}, new prompt.Separator(), ...datasetChoices]
      : datasetChoices,
  })

  if (selected === 'new') {
    debug('User wants to create a new dataset, prompting for name')
    const newDatasetName = await promptForDatasetName(prompt, {
      message: 'Name your dataset:',
      default: hasProduction ? undefined : 'production',
    })
    await client.datasets.create(newDatasetName)
    return newDatasetName
  }

  return selected
}

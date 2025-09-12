import {select} from '@inquirer/prompts'
import {type DatasetsResponse} from '@sanity/client'

interface PromptForDatasetOptions {
  datasets: DatasetsResponse

  allowCreation?: boolean
}

const NEW_DATASET_VALUE = 'new'

/**
 * Prompts the user to select a dataset from a list of datasets
 *
 * @param datasets - The list of datasets to choose from
 * @param allowCreation - Whether to allow the user to create a new dataset
 * @returns The selected dataset name
 *
 * @internal
 */
export async function promptForDataset(options: PromptForDatasetOptions): Promise<string> {
  const {allowCreation, datasets} = options

  let choices = datasets.map((dataset) => ({
    name: dataset.name,
    value: dataset.name,
  }))

  if (allowCreation) {
    choices = [{name: 'Create new dataset', value: NEW_DATASET_VALUE}, ...choices]
  }

  return select({
    choices,
    message: 'Select the dataset name:',
  })
}

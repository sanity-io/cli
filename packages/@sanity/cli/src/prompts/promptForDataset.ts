import {select} from '@inquirer/prompts'
import {getProjectCliClient} from '@sanity/cli-core'
import {type DatasetsResponse} from '@sanity/client'

interface PromptForDatasetOptions {
  projectId: string

  allowCreation?: boolean

  datasets?: DatasetsResponse
}

export const NEW_DATASET_VALUE = 'new'

/**
 * Prompts the user to select a dataset from a list of datasets
 *
 * @param projectId - The project ID to get the datasets from
 * @returns The selected dataset name
 *
 * @internal
 */
export async function promptForDataset(options: PromptForDatasetOptions): Promise<string> {
  const {allowCreation, datasets, projectId} = options

  const client = await getProjectCliClient({
    apiVersion: '2025-09-11',
    projectId,
    requireUser: true,
  })

  const datasetsToUse = datasets ?? (await client.datasets.list())

  let choices = datasetsToUse.map((dataset) => ({
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

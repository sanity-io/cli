import {type DatasetsResponse} from '@sanity/client'

import {promptForDataset} from '../../prompts/promptForDataset.js'
import {listDatasets} from '../../services/datasets.js'
import {assertDatasetExists} from '../backup/assertDatasetExist.js'

interface ResolveDatasetOptions {
  projectId: string

  dataset?: string
}

interface ResolveDatasetResult {
  dataset: string
  datasets: DatasetsResponse
}

/**
 * Lists datasets for a project, validates the given dataset name (or prompts
 * the user to pick one), and returns the resolved name together with the full
 * dataset list.
 */
export async function resolveDataset({
  dataset,
  projectId,
}: ResolveDatasetOptions): Promise<ResolveDatasetResult> {
  const datasets = await listDatasets(projectId)

  if (datasets.length === 0) {
    throw new Error('No datasets found in this project.')
  }

  if (dataset) {
    assertDatasetExists(datasets, dataset)
  } else {
    dataset = await promptForDataset({datasets})
  }

  return {dataset, datasets}
}

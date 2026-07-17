import {exitCodes, type Output} from '@sanity/cli-core'
import {type DatasetsResponse} from '@sanity/client'

import {promptForDataset} from '../../prompts/promptForDataset.js'
import {listDatasets} from '../../services/datasets.js'
import {assertDatasetExists} from '../backup/assertDatasetExist.js'

interface ResolveDatasetOptions {
  /** Output to use for user-facing messages from the calling command */
  output: Output

  projectId: string

  dataset?: string
  isUnattended?: boolean
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
  isUnattended,
  output,
  projectId,
}: ResolveDatasetOptions): Promise<ResolveDatasetResult> {
  if (!dataset && isUnattended) {
    output.error('Dataset name is required. Pass it as the `<dataset>` argument.', {
      exit: exitCodes.USAGE_ERROR,
    })
  }

  const datasets = await listDatasets(projectId)

  if (datasets.length === 0) {
    throw new Error('No datasets found in this project.')
  }

  if (dataset) {
    assertDatasetExists(datasets, dataset, output)
  } else {
    dataset = await promptForDataset({datasets})
  }

  return {dataset, datasets}
}

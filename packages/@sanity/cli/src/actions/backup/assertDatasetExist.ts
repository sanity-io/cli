import {ux} from '@oclif/core'
import {type DatasetsResponse} from '@sanity/client'

/**
 * Asserts that a dataset exists in a list of datasets, exits if not found
 *
 * @param datasets - The list of datasets to check
 * @param datasetName - The name of the dataset to check for
 */
export function assertDatasetExists(datasets: DatasetsResponse, datasetName: string): void {
  const exists = datasets.some((d) => d.name === datasetName)
  if (!exists) {
    ux.error(
      `Dataset '${datasetName}' not found in this project. Available datasets: ${datasets.map((d) => d.name).join(', ')}`,
      {exit: 1},
    )
  }
}

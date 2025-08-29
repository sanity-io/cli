import {ux} from '@oclif/core'
import {type DatasetsResponse} from '@sanity/client'

/**
 * Checks if a dataset exists in a list of datasets
 *
 * @param datasets - The list of datasets to check
 * @param datasetName - The name of the dataset to check for
 * @returns True if the dataset exists, false otherwise
 */
export function doesDatasetExist(datasets: DatasetsResponse, datasetName: string): boolean {
  const exists = datasets.some((d) => d.name === datasetName)
  if (!exists) {
    ux.error(
      `Dataset '${datasetName}' not found in this project. Available datasets: ${datasets.map((d) => d.name).join(', ')}`,
      {exit: 1},
    )
  }

  return exists
}

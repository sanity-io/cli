import {type Output} from '@sanity/cli-core'
import {type DatasetsResponse} from '@sanity/client'

/**
 * Asserts that a dataset exists in a list of datasets, exits if not found
 *
 * @param datasets - The list of datasets to check
 * @param datasetName - The name of the dataset to check for
 * @param output - Output to raise the error through the calling command
 */
export function assertDatasetExists(
  datasets: DatasetsResponse,
  datasetName: string,
  output: Output,
): void {
  const exists = datasets.some((d) => d.name === datasetName)
  if (!exists) {
    output.error(
      `Dataset '${datasetName}' not found in this project. Available datasets: ${datasets.map((d) => d.name).join(', ')}`,
      {exit: 1},
    )
  }
}

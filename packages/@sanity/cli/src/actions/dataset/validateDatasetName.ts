const MAX_DATASET_NAME_LENGTH = 64

/**
 * Validates a dataset name according to the following rules:
 * - Must be all lowercase characters
 * - Must be at least two characters long
 * - Must be at most 64 characters long
 * - Must start with a letter or a number
 * - Must not end with a dash or an underscore
 * - Must only contain letters, numbers, dashes and underscores
 *
 * @param datasetName - The dataset name to validate
 * @returns A string error message if the dataset name is invalid, or false if it is valid
 */
export function validateDatasetName(datasetName: string): false | string {
  if (!datasetName) {
    return 'Dataset name is missing'
  }

  const name = `${datasetName}`

  if (name.toLowerCase() !== name) {
    return 'Dataset name must be all lowercase characters'
  }

  if (name.length < 2) {
    return 'Dataset name must be at least two characters long'
  }

  if (name.length > MAX_DATASET_NAME_LENGTH) {
    return `Dataset name must be at most ${MAX_DATASET_NAME_LENGTH} characters`
  }

  if (!/^[a-z0-9]/.test(name)) {
    return 'Dataset name must start with a letter or a number'
  }

  if (!/^[a-z0-9][-_a-z0-9]+$/.test(name)) {
    return 'Dataset name must only contain letters, numbers, dashes and underscores'
  }

  if (/[-_]$/.test(name)) {
    return 'Dataset name must not end with a dash or an underscore'
  }

  return false
}

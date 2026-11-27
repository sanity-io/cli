import {loadStudioCliTooling} from '@sanity/cli-core/package-manager'
import {type SchemaValidationProblemGroup} from '@sanity/types'

/**
 * Extracts validation problem groups from a SchemaError.
 */
export async function extractValidationFromSchemaError(
  error: unknown,
  workDir: string,
): Promise<SchemaValidationProblemGroup[] | undefined> {
  const {getSchemaValidation} = await loadStudioCliTooling(workDir)

  return getSchemaValidation(error)
}

import {resolveLocalPackage} from '@sanity/cli-core'
import {type SchemaValidationProblemGroup} from '@sanity/types'

/**
 * Extracts validation problem groups from a SchemaError.
 */
export async function extractValidationFromSchemaError(
  error: unknown,
  workDir: string,
): Promise<SchemaValidationProblemGroup[] | undefined> {
  const {SchemaError} = await resolveLocalPackage<typeof import('sanity')>('sanity', workDir)

  if (error instanceof SchemaError) {
    return error.schema._validation
  }

  return undefined
}

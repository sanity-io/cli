import {type SchemaValidationProblemGroup} from '@sanity/types'

import {SchemaError} from '../SchemaError.js'

/**
 * Extracts validation problem groups from a SchemaError.
 */
export function extractValidationFromSchemaError(
  error: unknown,
): SchemaValidationProblemGroup[] | undefined {
  if (error instanceof SchemaError) {
    return error.schema._validation
  }

  return undefined
}

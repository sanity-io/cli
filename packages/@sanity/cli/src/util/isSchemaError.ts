import {type Schema, type SchemaValidationProblemGroup} from '@sanity/types'

/**
 * Detects errors thrown by Sanity's `resolveConfig()` / `getStudioWorkspaces()` where
 * schema validation problems are embedded on the thrown error object as `schema._validation`.
 *
 * The return type asserts both the full `Schema` (needed by validateSchema.worker.ts) and
 * that `_validation` is a `SchemaValidationProblemGroup[]` array (validated by the guard).
 */
export function isSchemaError(
  err: unknown,
): err is {schema: Schema & {_validation: SchemaValidationProblemGroup[]}} {
  return (
    err !== null &&
    typeof err === 'object' &&
    'schema' in err &&
    err.schema !== null &&
    typeof err.schema === 'object' &&
    '_validation' in err.schema &&
    Array.isArray(err.schema._validation)
  )
}

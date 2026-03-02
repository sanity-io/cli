import {type Schema} from '@sanity/types'

export function isSchemaError(err: unknown): err is {schema: Schema} {
  return (
    err !== null &&
    typeof err === 'object' &&
    'schema' in err &&
    err.schema !== null &&
    typeof err.schema === 'object' &&
    '_validation' in err.schema
  )
}

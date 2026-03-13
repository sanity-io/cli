import {Schema} from '@sanity/schema'

import {transformType} from '../schemaTypeTransformer.js'
import {type ManifestSchemaType} from '../types.js'

/**
 * Compiles a schema from user-defined types and extracts only the user-defined types
 * as ManifestSchemaType[], filtering out Sanity's built-in types.
 */
export function extractTypes(types: unknown[]): ManifestSchemaType[] {
  const schema = Schema.compile({name: 'test', types})
  const defaultTypeNames = new Set(
    Schema.compile({name: 'default', types: []}).getTypeNames() as string[],
  )
  const context = {schema}
  return (schema.getTypeNames() as string[])
    .filter((name: string) => !defaultTypeNames.has(name))
    .map((name: string) => transformType(schema.get(name), context))
}

import {defineTrace} from '@sanity/telemetry'

interface TypegenResourcesTraceData {
  /** Resources without a `schema` file, which use the schema bound to their dataset. */
  boundSchemaCount: number
  mode: 'generate' | 'watch'
  resourceCount: number
}

/**
 * Logged once per `sanity typegen generate` run that uses `typegen.resources`. The codegen
 * `Types Generated` trace looks the same for that path and for a single-schema config, so this
 * trace is what tells the two apart.
 */
export const TypegenResourcesTrace = defineTrace<TypegenResourcesTraceData>({
  description: 'User ran typegen generate with typegen.resources in the CLI config',
  name: 'Typegen Resources Used',
  version: 1,
})

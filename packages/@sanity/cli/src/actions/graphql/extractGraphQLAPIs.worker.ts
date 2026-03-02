import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces, resolveLocalPackage} from '@sanity/cli-core'

import {isSchemaError} from '../../util/isSchemaError.js'
import {extractFromSanitySchema} from './extractFromSanitySchema.js'
import {resolveGraphQLApis, type Workspace} from './resolveGraphQLApisFromWorkspaces.js'
import {SchemaError} from './SchemaError.js'
import {
  type ApiSpecification,
  type ExtractedGraphQLAPI,
  type GraphQLAPIConfig,
  type GraphQLWorkerResult,
  internal,
  type SchemaDefinitionish,
} from './types.js'

interface WorkerData {
  configPath: string
  workDir: string

  cliConfig?: {api?: unknown; graphql?: GraphQLAPIConfig[]}
  nonNullDocumentFieldsFlag?: boolean
  withUnionCache?: boolean
}

const {cliConfig, configPath, nonNullDocumentFieldsFlag, withUnionCache, workDir} =
  workerData as WorkerData

async function main() {
  if (isMainThread || !parentPort) {
    throw new Error('This module must be run as a worker thread')
  }

  // Load workspaces — this loads sanity.config.ts through Vite, caching `sanity` in the process
  let workspaces: Workspace[]
  try {
    workspaces = (await getStudioWorkspaces(configPath)) as Workspace[]
  } catch (err) {
    if (isSchemaError(err)) {
      const validation = err.schema._validation ?? []
      const configErrors = validation.filter((g) =>
        g.problems.some((p) => p.severity === 'error'),
      )

      // Only treat error-severity problems as schema errors. If the validation
      // only contains warnings, re-throw the original error so it isn't silently
      // swallowed — warnings alone should not block deployment.
      if (configErrors.length === 0) {
        throw err
      }

      parentPort.postMessage({apis: [], configErrors} satisfies GraphQLWorkerResult)
      return
    }
    throw err
  }

  // Resolve which GraphQL APIs to deploy from workspace + CLI config
  const resolvedApis = resolveGraphQLApis({cliConfig, workspaces})

  // Get createSchema from sanity (0ms — already cached by ViteNodeRunner)
  const {createSchema} = await resolveLocalPackage<typeof import('sanity')>('sanity', workDir)

  // Build default schema to identify built-in types that should be filtered out
  const defaultSchema = createSchema({name: 'default', types: []})
  const defaultTypes = defaultSchema.getTypeNames()
  const isCustomType = (type: SchemaDefinitionish) => !defaultTypes.includes(type.name)

  // For each API: create compiled schema, extract GraphQL spec, catch SchemaError
  const results: ExtractedGraphQLAPI[] = []

  for (const api of resolvedApis) {
    const apiBase: Omit<ExtractedGraphQLAPI, 'extracted' | 'extractionError' | 'schemaErrors'> = {
      dataset: api.dataset,
      filterSuffix: api.filterSuffix,
      generation: api.generation,
      id: api.id,
      nonNullDocumentFields: api.nonNullDocumentFields,
      playground: api.playground,
      projectId: api.projectId,
      tag: api.tag,
    }

    try {
      const schema = createSchema({
        name: 'default',
        types: api.schemaTypes.filter((type) => isCustomType(type)),
      })

      const extracted = extractFromSanitySchema(schema, {
        nonNullDocumentFields:
          nonNullDocumentFieldsFlag === undefined
            ? api.nonNullDocumentFields
            : nonNullDocumentFieldsFlag,
        withUnionCache,
      })

      // Symbol-keyed [internal] properties are stripped by the structured clone algorithm
      // used by postMessage. Convert them to string keys so they survive serialization.
      serializeInternalSymbols(extracted)

      results.push({...apiBase, extracted})
    } catch (err) {
      if (err instanceof SchemaError) {
        results.push({...apiBase, schemaErrors: err.problemGroups})
      } else {
        results.push({
          ...apiBase,
          extractionError: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  parentPort.postMessage({apis: results} satisfies GraphQLWorkerResult)
}

/**
 * Convert Symbol-keyed [internal] properties to string keys for postMessage serialization.
 * Symbol keys are stripped by the structured clone algorithm used by postMessage.
 * The main thread restores them via deserializeInternalSymbols in the orchestrator.
 */
function serializeInternalSymbols(extracted: ApiSpecification): void {
  for (const type of extracted.types) {
    if (internal in type) {
      ;(type as unknown as Record<string, unknown>).__internal = (
        type as unknown as Record<symbol, unknown>
      )[internal]
    }
  }
}

await main()

import {isMainThread} from 'node:worker_threads'

import {type CliConfig, findStudioConfigPath, getCliConfig, studioWorkerTask} from '@sanity/cli-core'

import {SchemaError} from './SchemaError.js'
import {
  type ApiSpecification,
  type ConvertedType,
  type ExtractedGraphQLAPI,
  type GraphQLWorkerResult,
  internal,
} from './types.js'

export async function extractGraphQLAPIs(
  workDir: string,
  options: {nonNullDocumentFieldsFlag?: boolean; withUnionCache?: boolean},
): Promise<ExtractedGraphQLAPI[]> {
  if (!isMainThread) {
    throw new Error('extractGraphQLAPIs() must be called from the main thread')
  }

  const [cliConfig, configPath] = await Promise.all([
    getCliConfig(workDir),
    findStudioConfigPath(workDir),
  ])

  const result = await studioWorkerTask<GraphQLWorkerResult>(
    new URL('extractGraphQLAPIs.worker.js', import.meta.url),
    {
      name: 'extractGraphQLAPIs',
      studioRootPath: workDir,
      workerData: {
        cliConfig: extractGraphQLConfig(cliConfig),
        configPath,
        nonNullDocumentFieldsFlag: options.nonNullDocumentFieldsFlag,
        withUnionCache: options.withUnionCache,
        workDir,
      },
    },
  )

  if (result.configErrors?.length) {
    throw new SchemaError(result.configErrors)
  }

  // Restore Symbol-keyed [internal] properties that were serialized as string keys
  // for postMessage. The gen3 schema generator reads type[internal] for deprecation info.
  for (const api of result.apis) {
    if (api.extracted) {
      deserializeInternalSymbols(api.extracted)
    }
  }

  return result.apis
}

function extractGraphQLConfig(config: CliConfig) {
  return structuredClone({
    graphql: config.graphql,
  })
}

/**
 * Restore Symbol-keyed [internal] properties from string keys after postMessage deserialization.
 * The worker converts `[internal]` (Symbol) to `__internal` (string) before postMessage,
 * since the structured clone algorithm strips Symbol keys.
 */
function deserializeInternalSymbols(extracted: ApiSpecification): void {
  for (const type of extracted.types) {
    const record = type as unknown as Record<string, unknown>
    if ('__internal' in record) {
      ;(type as ConvertedType)[internal] = record.__internal as ConvertedType[typeof internal]
      delete record.__internal
    }
  }
}

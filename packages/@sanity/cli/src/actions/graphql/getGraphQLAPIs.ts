import {isMainThread} from 'node:worker_threads'

import {type CliConfig, findStudioConfigPath, getCliConfig, studioWorkerTask} from '@sanity/cli-core'

import {SchemaError} from './SchemaError.js'
import {type ExtractedGraphQLAPI, type GraphQLWorkerResult} from './types.js'

export async function getGraphQLAPIs(workDir: string): Promise<ExtractedGraphQLAPI[]> {
  if (!isMainThread) {
    throw new Error('getGraphQLAPIs() must be called from the main thread')
  }

  const cliConfig = await getCliConfig(workDir)
  const configPath = await findStudioConfigPath(workDir)

  const result = await studioWorkerTask<GraphQLWorkerResult>(
    new URL('getGraphQLAPIs.worker.js', import.meta.url),
    {
      name: 'getGraphQLAPIs',
      studioRootPath: workDir,
      workerData: {
        cliConfig: extractGraphQLConfig(cliConfig),
        configPath,
      },
    },
  )

  if (result.configErrors?.length) {
    throw new SchemaError(result.configErrors)
  }

  return result.apis
}

function extractGraphQLConfig(config: CliConfig) {
  return structuredClone({
    api: config.api,
    graphql: config.graphql,
  })
}

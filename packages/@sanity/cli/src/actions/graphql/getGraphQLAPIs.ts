import {isMainThread} from 'node:worker_threads'

import {type CliConfig, findStudioConfigPath, getCliConfig, studioWorkerTask} from '@sanity/cli-core'

import {type ExtractedGraphQLAPI} from './types.js'

export async function getGraphQLAPIs(workDir: string): Promise<ExtractedGraphQLAPI[]> {
  if (!isMainThread) {
    throw new Error('getGraphQLAPIs() must be called from the main thread')
  }

  const cliConfig = await getCliConfig(workDir)
  const configPath = await findStudioConfigPath(workDir)

  return studioWorkerTask<ExtractedGraphQLAPI[]>(
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
}

function extractGraphQLConfig(config: CliConfig) {
  return structuredClone({
    api: config.api,
    graphql: config.graphql,
  })
}

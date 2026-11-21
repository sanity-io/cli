import {isMainThread} from 'node:worker_threads'

import {findStudioConfigPath, getCliConfig} from '@sanity/cli-core'

import {loadCliBuild} from '../../util/loadCliBuild.js'
import {type ExtractedGraphQLAPI} from './types.js'

export async function getGraphQLAPIs(workDir: string): Promise<ExtractedGraphQLAPI[]> {
  if (!isMainThread) {
    throw new Error('getGraphQLAPIs() must be called from the main thread')
  }

  const [cliConfig, configPath] = await Promise.all([
    getCliConfig(workDir),
    findStudioConfigPath(workDir),
  ])

  const {studioWorkerTask} = await loadCliBuild('worker')
  return studioWorkerTask<ExtractedGraphQLAPI[]>(
    new URL('getGraphQLAPIs.worker.js', import.meta.url),
    {
      name: 'getGraphQLAPIs',
      studioRootPath: workDir,
      workerData: {
        cliConfig: {graphql: cliConfig.graphql},
        configPath,
      },
    },
  )
}

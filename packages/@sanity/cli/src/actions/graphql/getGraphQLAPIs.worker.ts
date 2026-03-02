import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces} from '@sanity/cli-core'

import {isSchemaError} from '../../util/isSchemaError.js'
import {resolveGraphQLApis} from './resolveGraphQLApisFromWorkspaces.js'
import {type GraphQLAPIConfig, type GraphQLWorkerResult} from './types.js'

interface WorkerData {
  configPath: string

  cliConfig?: {api?: unknown; graphql?: GraphQLAPIConfig[]}
}

const {cliConfig, configPath} = workerData as WorkerData

async function main() {
  if (isMainThread || !parentPort) {
    throw new Error('This module must be run as a worker thread')
  }

  // Load workspaces — this loads sanity.config.ts through Vite
  let workspaces
  try {
    workspaces = await getStudioWorkspaces(configPath)
  } catch (err) {
    if (isSchemaError(err)) {
      const validation = err.schema._validation ?? []
      const configErrors = validation.filter((g) =>
        g.problems.some((p) => p.severity === 'error'),
      )
      parentPort.postMessage({apis: [], configErrors} satisfies GraphQLWorkerResult)
      return
    }
    throw err
  }

  // Resolve which GraphQL APIs exist from workspace + CLI config
  const resolvedApis = resolveGraphQLApis({cliConfig, workspaces})

  const apis = resolvedApis.map((api) => ({
    dataset: api.dataset,
    filterSuffix: api.filterSuffix,
    generation: api.generation,
    id: api.id,
    nonNullDocumentFields: api.nonNullDocumentFields,
    playground: api.playground,
    projectId: api.projectId,
    tag: api.tag,
  }))

  parentPort.postMessage({apis} satisfies GraphQLWorkerResult)
}

await main()

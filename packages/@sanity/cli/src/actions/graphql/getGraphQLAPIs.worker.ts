import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces} from '@sanity/cli-core'

import {resolveGraphQLApis} from './resolveGraphQLApisFromWorkspaces.js'
import {type ExtractedGraphQLAPI, type GraphQLAPIConfig} from './types.js'

if (isMainThread || !parentPort) {
  throw new Error('This module must be run as a worker thread')
}

interface WorkerData {
  configPath: string

  cliConfig?: {api?: unknown; graphql?: GraphQLAPIConfig[]}
}

const {cliConfig, configPath} = workerData as WorkerData

// Load workspaces — this loads sanity.config.ts through Vite
const workspaces = await getStudioWorkspaces(configPath)

// Resolve which GraphQL APIs exist from workspace + CLI config
const resolvedApis = resolveGraphQLApis({cliConfig, workspaces})

const results: ExtractedGraphQLAPI[] = resolvedApis.map((api) => ({
  dataset: api.dataset,
  filterSuffix: api.filterSuffix,
  generation: api.generation,
  id: api.id,
  nonNullDocumentFields: api.nonNullDocumentFields,
  playground: api.playground,
  projectId: api.projectId,
  tag: api.tag,
}))

parentPort.postMessage(results)

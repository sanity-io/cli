import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {doImport, isStudioConfig} from '@sanity/cli-core'

import {
  resolveGraphQLApiMetadata,
  type WorkspaceMetadata,
} from './resolveGraphQLApisFromWorkspaces.js'
import {type GraphQLAPIConfig} from './types.js'

interface WorkerData {
  configPath: string

  cliConfig?: {graphql?: GraphQLAPIConfig[]}
}

const {cliConfig, configPath} = workerData as WorkerData

async function main() {
  if (isMainThread || !parentPort) {
    throw new Error('This module must be run as a worker thread')
  }

  // Import the raw config through Vite (via studioWorkerTask) — handles TS paths, browser globals.
  // We skip resolveConfig() entirely to avoid schema compilation — we only need workspace metadata.
  let config: unknown = await doImport(configPath)

  // Handle both direct config exports and default exports (same logic as getStudioWorkspaces)
  if (!isStudioConfig(config)) {
    if (
      typeof config === 'object' &&
      config !== null &&
      'default' in config &&
      isStudioConfig(config.default)
    ) {
      config = config.default
    } else {
      throw new TypeError(`Invalid studio config format in "${configPath}"`)
    }
  }

  const configs: unknown[] = Array.isArray(config) ? config : [config]
  const workspaces = configs.map((ws) => toWorkspaceMetadata(ws))

  const apis = resolveGraphQLApiMetadata({cliConfig, workspaces})
  parentPort.postMessage(apis)
}

function toWorkspaceMetadata(config: unknown): WorkspaceMetadata {
  if (typeof config !== 'object' || config === null) {
    throw new Error('Invalid workspace config: expected an object')
  }

  if (!('projectId' in config) || typeof config.projectId !== 'string') {
    throw new Error('Invalid workspace config: missing or invalid projectId')
  }

  if (!('dataset' in config) || typeof config.dataset !== 'string') {
    throw new Error('Invalid workspace config: missing or invalid dataset')
  }

  const name = 'name' in config && typeof config.name === 'string' ? config.name : 'default'

  return {
    dataset: config.dataset,
    name,
    projectId: config.projectId,
  }
}

await main()

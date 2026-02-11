import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces, safeStructuredClone} from '@sanity/cli-core'

import {uniqWorkspaceWorkerDataSchema} from './types.js'
import {uniqByProjectIdDataset} from './utils/uniqByProjectIdDataset.js'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const {configPath, dataset} = uniqWorkspaceWorkerDataSchema.parse(workerData)

try {
  const workspaces = await getStudioWorkspaces(configPath)

  let filteredWorkspaces = workspaces
  // If a dataset is provided, filter the workspaces to only include those with the same dataset
  if (dataset) {
    filteredWorkspaces = workspaces.filter((workspace) => workspace.dataset === dataset)
  }

  const uniqueWorkspaces = uniqByProjectIdDataset(filteredWorkspaces)

  parentPort.postMessage(safeStructuredClone(uniqueWorkspaces))
} catch (error) {
  throw new Error(error instanceof Error ? error.message : String(error))
}

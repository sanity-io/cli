import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces, safeStructuredClone} from '@sanity/cli-core'
import {z} from 'zod'

import {uniqByProjectIdDataset} from './utils/uniqByProjectIdDataset.js'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const {configPath, dataset} = z
  .object({configPath: z.string(), dataset: z.string().optional()})
  .parse(workerData)

try {
  const workspaces = await getStudioWorkspaces(configPath)
  const filteredWorkspaces = workspaces.filter(
    (workspace) => !dataset || workspace.dataset === dataset,
  )
  const projectDatasets = uniqByProjectIdDataset(filteredWorkspaces)

  parentPort.postMessage(safeStructuredClone(projectDatasets))
} catch (error) {
  throw new Error(error instanceof Error ? error.message : String(error))
}

import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces, safeStructuredClone} from '@sanity/cli-core'
import {z} from 'zod'

import {uniqByProjectIdDataset} from './utils/uniqByProjectIdDataset.js'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const {configPath} = z.object({configPath: z.string()}).parse(workerData)

try {
  const workspaces = await getStudioWorkspaces(configPath)
  const projectDatasets = uniqByProjectIdDataset(workspaces)

  parentPort.postMessage(safeStructuredClone(projectDatasets))
} catch (error) {
  throw new Error(error instanceof Error ? error.message : String(error))
}

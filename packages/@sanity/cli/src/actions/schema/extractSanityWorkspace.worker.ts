import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces, safeStructuredClone} from '@sanity/cli-core'

import {extractWorkspaceWorkerData} from './types.js'
import {extractValidationFromSchemaError} from './utils/extractValidationFromSchemaError.js'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const {configPath, workDir} = extractWorkspaceWorkerData.parse(workerData)

try {
  const workspaces = await getStudioWorkspaces(configPath)

  parentPort.postMessage({
    type: 'success',
    workspaces: safeStructuredClone(workspaces),
  })
} catch (error) {
  const validation = await extractValidationFromSchemaError(error, workDir)
  parentPort.postMessage({
    error: error instanceof Error ? error.message : String(error),
    type: 'error',
    validation,
  })
}

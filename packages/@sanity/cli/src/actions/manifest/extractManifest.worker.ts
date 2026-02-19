import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces} from '@sanity/cli-core'

import {extractValidationFromSchemaError} from '../schema/utils/extractValidationFromSchemaError.js'
import {extractWorkspaceManifest} from './extractWorkspaceManifest.js'
import {extractManifestWorkerData} from './types.js'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const {configPath, workDir} = extractManifestWorkerData.parse(workerData)

try {
  const workspaces = await getStudioWorkspaces(configPath)
  const workspaceManifests = await extractWorkspaceManifest(workspaces, workDir)

  parentPort.postMessage({
    type: 'success',
    workspaceManifests,
  })
} catch (error) {
  const validation = await extractValidationFromSchemaError(error, workDir)
  parentPort.postMessage({
    error: error instanceof Error ? error.message : String(error),
    type: 'error',
    validation,
  })
}

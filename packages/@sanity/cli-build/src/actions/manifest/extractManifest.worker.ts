import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces, subdebug} from '@sanity/cli-core'

import {extractValidationFromSchemaError} from '../schema/utils/extractValidationFromSchemaError.js'
import {extractWorkspaceManifest} from './extractWorkspaceManifest.js'
import {extractManifestWorkerData} from './types.js'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const debug = subdebug('extractManifest.worker')

const {configPath, workDir} = extractManifestWorkerData.parse(workerData)

try {
  debug('Extracting workspace manifests from config path %s', configPath)
  const workspaces = await getStudioWorkspaces(configPath)
  debug('Workspaces %o', workspaces)
  const workspaceManifests = await extractWorkspaceManifest(workspaces, workDir)

  parentPort.postMessage({
    type: 'success',
    workspaceManifests,
  })
} catch (error) {
  debug('Error extracting workspace manifests', error)
  const validation = await extractValidationFromSchemaError(error, workDir)
  parentPort.postMessage({
    error: error instanceof Error ? error.message : String(error),
    type: 'error',
    validation,
  })
}

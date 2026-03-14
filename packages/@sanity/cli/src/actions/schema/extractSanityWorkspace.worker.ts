import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces, safeStructuredClone} from '@sanity/cli-core'
import {type Schema} from '@sanity/types'

import {extractManifestSchemaTypes} from '../manifest/extractWorkspaceManifest.js'
import {extractWorkspaceWorkerData} from './types.js'
import {extractValidationFromSchemaError} from './utils/extractValidationFromSchemaError.js'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const {configPath, workDir} = extractWorkspaceWorkerData.parse(workerData)

try {
  const workspaces = await getStudioWorkspaces(configPath)

  // Extract manifest schemas while Schema objects are still live (before structured clone
  // strips class methods like getTypeNames/get). The API expects ManifestSchemaType[], not
  // the runtime Schema class instance.
  const workspacesWithManifest = await Promise.all(
    workspaces.map(async (workspace) => ({
      ...safeStructuredClone(workspace),
      manifestSchema: await extractManifestSchemaTypes(workspace.schema as Schema, workDir),
    })),
  )

  parentPort.postMessage({
    type: 'success',
    workspaces: workspacesWithManifest,
  })
} catch (error) {
  const validation = await extractValidationFromSchemaError(error, workDir)
  parentPort.postMessage({
    error: error instanceof Error ? error.message : String(error),
    type: 'error',
    validation,
  })
}

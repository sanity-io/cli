import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces} from '@sanity/cli-core'
import {extractSchema} from '@sanity/schema/_internal'

import {getWorkspace} from '../../util/getWorkspace.js'
import {extractSchemaWorkerData} from './types.js'
import {extractValidationFromSchemaError} from './utils/extractValidationFromSchemaError.js'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const {configPath, enforceRequiredFields, workDir, workspaceName} =
  extractSchemaWorkerData.parse(workerData)

try {
  const workspaces = await getStudioWorkspaces(configPath)
  if (workspaces.length === 0) {
    throw new Error('Failed to resolve configuration')
  }

  const workspace = getWorkspace(workspaces, workspaceName)
  const schema = extractSchema(workspace.schema, {
    enforceRequiredFields,
  })

  parentPort.postMessage({
    schema,
    type: 'success',
  })
} catch (error) {
  const validation = await extractValidationFromSchemaError(error, workDir)
  parentPort.postMessage({
    error: error instanceof Error ? error.message : String(error),
    type: 'error',
    validation,
  })
}

// Explicitly exit the process to avoid any dangling references from keeping
// the process alive after resolving it's main task
setImmediate(() => {
  process.exit(1)
})

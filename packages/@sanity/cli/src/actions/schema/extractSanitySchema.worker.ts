import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {doImport, getEmptyAuth, resolveLocalPackage} from '@sanity/cli-core'
import {extractSchema} from '@sanity/schema/_internal'
import {firstValueFrom, of} from 'rxjs'
import {z} from 'zod'

import {getWorkspace} from '../../util/getWorkspace.js'
import {extractValidationFromSchemaError} from './utils/extractValiationFromSchemaError.js'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const {configPath, enforceRequiredFields, workspaceName} = z
  .object({configPath: z.string(), enforceRequiredFields: z.boolean(), workspaceName: z.string()})
  .parse(workerData)

const config = await doImport(configPath)

const {resolveConfig} = await resolveLocalPackage<typeof import('sanity')>('sanity', configPath)
if (typeof resolveConfig !== 'function') {
  throw new TypeError('Expected `resolveConfig` from `sanity` to be a function')
}

// We will also want to stub out some configuration - we don't need to resolve the
// users' logged in state, for instance - so let's disable the auth implementation.
const rawWorkspaces = Array.isArray(config)
  ? config
  : [{...config, basePath: config.basePath || '/', name: config.name || 'default'}]

rawWorkspaces.map((workspace) => {
  workspace.auth = {state: of(getEmptyAuth())}
})

try {
  const workspaces = await firstValueFrom(resolveConfig(rawWorkspaces))
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
  const validation = extractValidationFromSchemaError(error)
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

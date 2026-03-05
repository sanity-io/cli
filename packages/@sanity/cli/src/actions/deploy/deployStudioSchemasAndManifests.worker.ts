import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces, subdebug} from '@sanity/cli-core'
import {type Workspace} from 'sanity'

import {extractWorkspaceManifest} from '../manifest/extractWorkspaceManifest.js'
import {writeManifestFile} from '../manifest/writeManifestFile.js'
import {updateWorkspacesSchemas} from '../schema/updateWorkspaceSchema.js'
import {extractValidationFromSchemaError} from '../schema/utils/extractValidationFromSchemaError.js'
import {deployStudioSchemasAndManifestsWorkerData} from './types.js'

if (isMainThread || !parentPort) {
  throw new Error('Should only be run in a worker!')
}

const debug = subdebug('deployStudioSchemasAndManifests.worker')

const {configPath, isExternal, outPath, schemaRequired, verbose, workDir} =
  deployStudioSchemasAndManifestsWorkerData.parse(workerData)

try {
  debug('Deploying studio schemas and manifests from config path %s', configPath)
  const workspaces = await getStudioWorkspaces(configPath)
  debug('Workspaces %o', workspaces)

  if (workspaces.length === 0) {
    throw new Error('No workspaces found')
  }

  debug('Handling deployment for %s', isExternal ? 'external' : 'internal')
  await (isExternal
    ? handleExternalDeployment(workspaces, schemaRequired)
    : handleInternalDeployment(workspaces))

  parentPort.postMessage({
    type: 'success',
  })
} catch (error) {
  debug('Error deploying studio schemas and manifests', error)
  const validation = await extractValidationFromSchemaError(error, workDir)
  parentPort.postMessage({
    error: error instanceof Error ? error.message : String(error),
    type: 'error',
    validation,
  })
}

async function writeWorkspaceToDist(workspaces: Workspace[]) {
  // Get the create manifest workspace
  const workspaceManifests = await extractWorkspaceManifest(workspaces, workDir)

  await writeManifestFile({
    outPath,
    workDir,
    workspaceManifests,
  })
}

/**
 * External deployments:
 * 1. Update the workspace schemas to the /schemas endpoint IF --schema-required is passed
 * 2. Update server-side schemas
 */
function handleExternalDeployment(workspaces: Workspace[], schemaRequired: boolean) {
  const tasks = []

  if (schemaRequired) {
    tasks.push(
      updateWorkspacesSchemas({
        verbose,
        workspaces,
      }),
    )
  }

  return Promise.all(tasks)
}

/**
 *
 * Internal deployments:
 * 1. Write the workspace manifests to the dist directory
 * 2. Update the workspaces schemas to the /schemas endpoint
 * 3. Update server-side schemas
 *
 * @param workspaces - The workspaces to deploy
 */
function handleInternalDeployment(workspaces: Workspace[]) {
  return Promise.all([
    writeWorkspaceToDist(workspaces),
    // Updates the workspaces schemas to /schemas endpoint
    updateWorkspacesSchemas({
      verbose,
      workspaces,
    }),
  ])
}

import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces, subdebug} from '@sanity/cli-core'
import {type StudioManifest, type Workspace} from 'sanity'

import {extractWorkspaceManifest} from '../manifest/extractWorkspaceManifest.js'
import {writeManifestFile} from '../manifest/writeManifestFile.js'
import {updateWorkspacesSchemas} from '../schema/updateWorkspaceSchema.js'
import {uploadSchemaToLexicon} from '../schema/uploadSchemaToLexicon.js'
import {extractValidationFromSchemaError} from '../schema/utils/extractValidationFromSchemaError.js'
import {deployStudioSchemasAndManifestsWorkerData} from './types.js'

const debug = subdebug('deployStudioSchemasAndManifests.worker')

async function main() {
  if (isMainThread || !parentPort) {
    throw new Error('Should only be run in a worker!')
  }

  const {configPath, isExternal, outPath, projectId, schemaRequired, verbose, workDir} =
    deployStudioSchemasAndManifestsWorkerData.parse(workerData)

  try {
    debug('Deploying studio schemas and manifests from config path %s', configPath)
    const workspaces = await getStudioWorkspaces(configPath)
    debug('Workspaces %o', workspaces)

    if (workspaces.length === 0) {
      throw new Error('No workspaces found')
    }

    debug('Handling deployment for %s', isExternal ? 'external' : 'internal')

    let studioManifest: StudioManifest | null | void = null

    if (isExternal) {
      ;[studioManifest] = await handleExternalDeployment({
        projectId,
        schemaRequired,
        verbose,
        workDir,
        workspaces,
      })
    } else {
      ;[studioManifest] = await handleInternalDeployment({
        outPath,
        projectId,
        verbose,
        workDir,
        workspaces,
      })
    }

    parentPort.postMessage({
      studioManifest,
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
}

async function writeWorkspaceToDist({
  outPath,
  workDir,
  workspaces,
}: {
  outPath: string
  workDir: string
  workspaces: Workspace[]
}) {
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
function handleExternalDeployment({
  projectId,
  schemaRequired,
  verbose,
  workDir,
  workspaces,
}: {
  projectId: string
  schemaRequired: boolean
  verbose: boolean
  workDir: string
  workspaces: Workspace[]
}) {
  const tasks: Promise<StudioManifest | null | void>[] = [
    uploadSchemaToLexicon({
      projectId,
      verbose,
      workDir,
      workspaces,
    }),
  ]

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
function handleInternalDeployment({
  outPath,
  projectId,
  verbose,
  workDir,
  workspaces,
}: {
  outPath: string
  projectId: string
  verbose: boolean
  workDir: string
  workspaces: Workspace[]
}) {
  return Promise.all([
    uploadSchemaToLexicon({
      projectId,
      verbose,
      workDir,
      workspaces,
    }),
    writeWorkspaceToDist({outPath, workDir, workspaces}),
    // Updates the workspaces schemas to /schemas endpoint
    updateWorkspacesSchemas({
      verbose,
      workspaces,
    }),
  ])
}

await main()

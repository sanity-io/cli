import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces, subdebug} from '@sanity/cli-core'
import {type StudioManifest, type Workspace} from 'sanity'

import {extractWorkspaceManifest} from '../manifest/extractWorkspaceManifest.js'
import {type CreateWorkspaceManifest} from '../manifest/types.js'
import {writeManifestFile} from '../manifest/writeManifestFile.js'
import {
  updateWorkspacesSchemas,
  type WorkspaceSchemaInput,
} from '../schema/updateWorkspaceSchema.js'
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

    // Extract manifest data (including ManifestSchemaType[]) once, while Schema objects are
    // still live. Both writeWorkspaceToDist and updateWorkspacesSchemas consume the result.
    const workspaceManifests = await extractWorkspaceManifest(workspaces, workDir)

    const schemaInputs: WorkspaceSchemaInput[] = workspaceManifests.map((manifest) => ({
      dataset: manifest.dataset,
      manifestSchema: manifest.schema,
      name: manifest.name,
      projectId: manifest.projectId,
      title: manifest.title,
    }))

    debug('Handling deployment for %s', isExternal ? 'external' : 'internal')

    let studioManifest: StudioManifest | null = null

    if (isExternal) {
      ;[studioManifest] = await handleExternalDeployment({
        projectId,
        schemaInputs,
        schemaRequired,
        verbose,
        workDir,
        workspaces,
      })
    } else {
      ;[studioManifest] = await handleInternalDeployment({
        outPath,
        projectId,
        schemaInputs,
        verbose,
        workDir,
        workspaceManifests,
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

/**
 * External deployments:
 * 1. Update the workspace schemas to the /schemas endpoint IF --schema-required is passed
 * 2. Update server-side schemas
 */
async function handleExternalDeployment({
  projectId,
  schemaInputs,
  schemaRequired,
  verbose,
  workDir,
  workspaces,
}: {
  projectId: string
  schemaInputs: WorkspaceSchemaInput[]
  schemaRequired: boolean
  verbose: boolean
  workDir: string
  workspaces: Workspace[]
}): Promise<[StudioManifest | null]> {
  const [studioManifest] = await Promise.all([
    uploadSchemaToLexicon({
      projectId,
      verbose,
      workDir,
      workspaces,
    }),
    schemaRequired ? updateWorkspacesSchemas({verbose, workspaces: schemaInputs}) : undefined,
  ])

  return [studioManifest]
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
async function handleInternalDeployment({
  outPath,
  projectId,
  schemaInputs,
  verbose,
  workDir,
  workspaceManifests,
  workspaces,
}: {
  outPath: string
  projectId: string
  schemaInputs: WorkspaceSchemaInput[]
  verbose: boolean
  workDir: string
  workspaceManifests: CreateWorkspaceManifest[]
  workspaces: Workspace[]
}): Promise<[StudioManifest | null]> {
  const [studioManifest] = await Promise.all([
    uploadSchemaToLexicon({
      projectId,
      verbose,
      workDir,
      workspaces,
    }),
    writeManifestFile({outPath, workDir, workspaceManifests}),
    // Updates the workspaces schemas to /schemas endpoint
    updateWorkspacesSchemas({
      verbose,
      workspaces: schemaInputs,
    }),
  ])

  return [studioManifest]
}

await main()

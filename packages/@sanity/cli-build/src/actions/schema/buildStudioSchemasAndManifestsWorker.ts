import {isMainThread} from 'node:worker_threads'

import {getStudioWorkspaces, subdebug} from '@sanity/cli-core'
import {type StudioManifest, type Workspace} from 'sanity'

import {extractWorkspaceManifest} from '../manifest/extractWorkspaceManifest.js'
import {type CreateWorkspaceManifest, WorkspaceSchemaInput} from '../manifest/types.js'
import {writeManifestFile} from '../manifest/writeManifestFile.js'
import {type BuildStudioSchemasAndManifestsWorkerSuccess} from './buildStudioSchemasAndManifests.js'
import {type BuildStudioSchemasAndManifestsWorkerData} from './types.js'
import {uploadSchemaToLexicon} from './uploadSchemaToLexicon.js'

const debug = subdebug('buildStudioSchemasAndManifests.worker')

/**
 * This function must only be called from another worker process.
 * @param options - The worker options
 */
export async function workerBuildStudioSchemasAndManifests(
  options: BuildStudioSchemasAndManifestsWorkerData & {
    workspaceSchemaHandler?: (workspaces: WorkspaceSchemaInput[]) => Promise<void>
  },
): Promise<BuildStudioSchemasAndManifestsWorkerSuccess> {
  if (isMainThread) {
    throw new Error(
      'workerBuildStudioSchemasAndManifests should only be called from a worker thread',
    )
  }

  const {
    configPath,
    isExternal,
    outPath,
    projectId,
    schemaRequired,
    verbose,
    workDir,
    workspaceSchemaHandler,
  } = options

  debug('Building studio schemas and manifests from config path %s', configPath)
  const workspaces = await getStudioWorkspaces(configPath)
  debug('Workspaces %o', workspaces)

  if (workspaces.length === 0) {
    throw new Error('No workspaces found')
  }

  // Extract manifest data (including ManifestSchemaType[]) once, while Schema objects are
  // still live. Both writeWorkspaceToDist and updateWorkspacesSchemas consume the result.
  const workspaceManifests = await extractWorkspaceManifest(workspaces, workDir)

  debug('Handling build for %s', isExternal ? 'external' : 'internal')

  async function workspaceManifestsHandler(
    workspaceManifests: CreateWorkspaceManifest[],
  ): Promise<WorkspaceSchemaInput[] | null> {
    if (!isExternal || schemaRequired) {
      const schemaInputs: WorkspaceSchemaInput[] = workspaceManifests.map((manifest) => ({
        dataset: manifest.dataset,
        manifestSchema: manifest.schema,
        name: manifest.name,
        projectId: manifest.projectId,
        title: manifest.title,
      }))

      if (workspaceSchemaHandler) {
        await workspaceSchemaHandler(schemaInputs)
      }

      return schemaInputs
    }

    return null
  }

  const result = isExternal
    ? await handleExternalStudio({
        projectId,
        verbose,
        workDir,
        workspaceManifests,
        workspaceManifestsHandler,
        workspaces,
      })
    : await handleInternalStudio({
        outPath,
        projectId,
        verbose,
        workDir,
        workspaceManifests,
        workspaceManifestsHandler,
        workspaces,
      })

  return {
    schemaInputs: result.schemaInputs,
    studioManifest: result.studioManifest,
    type: 'success',
  }
}

type HandleStudioResult = {
  schemaInputs: WorkspaceSchemaInput[] | null
  studioManifest: StudioManifest | null
}

/**
 * External deployments:
 * 1. Update the workspace schemas to the /schemas endpoint IF --schema-required is passed
 * 2. Call the workspace manifest handler if provided to update server-side schemas
 */
async function handleExternalStudio({
  projectId,
  verbose,
  workDir,
  workspaceManifests,
  workspaceManifestsHandler,
  workspaces,
}: {
  projectId: string
  verbose: boolean
  workDir: string
  workspaceManifests: CreateWorkspaceManifest[]
  workspaceManifestsHandler: (
    workspaceManifests: CreateWorkspaceManifest[],
  ) => Promise<WorkspaceSchemaInput[] | null>
  workspaces: Workspace[]
}): Promise<HandleStudioResult> {
  const [studioManifest, schemaInputs] = await Promise.all([
    uploadSchemaToLexicon({
      projectId,
      verbose,
      workDir,
      workspaces,
    }),
    workspaceManifestsHandler(workspaceManifests),
  ])

  return {schemaInputs, studioManifest}
}

/**
 *
 * Internal deployments:
 * 1. Write the workspace manifests to the dist directory
 * 2. Update the workspaces schemas to the /schemas endpoint
 * 3. Call the workspace manifest handler if provided to update server-side schemas
 *
 * @param workspaces - The workspaces to deploy
 */
async function handleInternalStudio({
  outPath,
  projectId,
  verbose,
  workDir,
  workspaceManifests,
  workspaceManifestsHandler,
  workspaces,
}: {
  outPath: string
  projectId: string
  verbose: boolean
  workDir: string
  workspaceManifests: CreateWorkspaceManifest[]
  workspaceManifestsHandler: (
    workspaceManifests: CreateWorkspaceManifest[],
  ) => Promise<WorkspaceSchemaInput[] | null>
  workspaces: Workspace[]
}): Promise<HandleStudioResult> {
  const [studioManifest, schemaInputs] = await Promise.all([
    uploadSchemaToLexicon({
      projectId,
      verbose,
      workDir,
      workspaces,
    }),
    workspaceManifestsHandler(workspaceManifests),
    writeManifestFile({outPath, workDir, workspaceManifests}),
  ])

  return {schemaInputs, studioManifest}
}

import {isMainThread} from 'node:worker_threads'

import {getStudioWorkspaces, subdebug} from '@sanity/cli-core'

import {extractWorkspaceManifest} from '../manifest/extractWorkspaceManifest.js'
import {type WorkspaceSchemaInput} from '../manifest/types.js'
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

  const uploadToLexiconPromise = uploadSchemaToLexicon({
    projectId,
    verbose,
    workDir,
    workspaces,
  })

  let writeManifestPromise: Promise<void> | undefined
  if (!isExternal) writeManifestPromise = writeManifestFile({outPath, workDir, workspaceManifests})

  let schemaInputs: WorkspaceSchemaInput[] | null = null
  let workspaceSchemaPromise: Promise<void> | undefined
  if (!isExternal || schemaRequired) {
    schemaInputs = workspaceManifests.map((manifest) => ({
      dataset: manifest.dataset,
      manifestSchema: manifest.schema,
      name: manifest.name,
      projectId: manifest.projectId,
      title: manifest.title,
    }))

    if (workspaceSchemaHandler) workspaceSchemaPromise = workspaceSchemaHandler(schemaInputs)
  }

  const promises: Promise<unknown>[] = [uploadToLexiconPromise]
  if (writeManifestPromise) promises.push(writeManifestPromise)
  if (workspaceSchemaPromise) promises.push(workspaceSchemaPromise)
  await Promise.all(promises)

  return {
    schemaInputs,
    studioManifest: await uploadToLexiconPromise,
    type: 'success',
  }
}

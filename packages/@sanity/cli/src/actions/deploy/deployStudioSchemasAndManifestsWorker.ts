import {
  extractValidationFromSchemaError,
  workerBuildStudioSchemasAndManifests,
} from '@sanity/cli-build/_internal/extract'
import {type CreateWorkspaceManifest} from '@sanity/cli-build/_internal/manifest'
import {subdebug} from '@sanity/cli-core'
import {flattenErrorCauses} from '@sanity/cli-core/errors'

import {
  updateWorkspacesSchemas,
  type WorkspaceSchemaInput,
} from '../schema/updateWorkspaceSchema.js'
import {
  deployStudioSchemasAndManifestsWorkerData,
  type DeployStudioSchemasAndManifestsWorkerMessage,
} from './types.js'

const debug = subdebug('deployStudioSchemasAndManifests.worker')

/**
 * The subset of `MessagePort` this worker needs, so the body can be driven
 * without a real thread.
 */
export interface DeployStudioSchemasAndManifestsPort {
  postMessage: (message: DeployStudioSchemasAndManifestsWorkerMessage) => void
}

/**
 * Body of `deployStudioSchemasAndManifests.worker.ts`, kept out of the thread entry point so it
 * can be exercised directly in tests.
 *
 * 1. Validates the worker data
 * 2. Builds the studio schemas and manifests, updating the `/schemas` endpoint along the way
 * 3. Posts either the resulting studio manifest or a serialized error back to the parent
 *
 * @param port - The port to post the result to
 * @param workerData - The unvalidated worker data handed to the worker
 */
export async function deployStudioSchemasAndManifestsWorker(
  port: DeployStudioSchemasAndManifestsPort,
  workerData: unknown,
): Promise<void> {
  const parsedWorkerData = deployStudioSchemasAndManifestsWorkerData.parse(workerData)

  const options: Parameters<typeof workerBuildStudioSchemasAndManifests>[0] = parsedWorkerData

  options.workspaceManifestsHandler = async (workspaceManifests: CreateWorkspaceManifest[]) => {
    if (!options.isExternal || parsedWorkerData.schemaRequired) {
      const schemaInputs: WorkspaceSchemaInput[] = workspaceManifests.map((manifest) => ({
        dataset: manifest.dataset,
        manifestSchema: manifest.schema,
        name: manifest.name,
        projectId: manifest.projectId,
        title: manifest.title,
      }))

      // Updates the workspaces schemas to /schemas endpoint
      await updateWorkspacesSchemas({verbose: options.verbose, workspaces: schemaInputs})
    }
  }

  try {
    const result = await workerBuildStudioSchemasAndManifests(options)

    port.postMessage({
      studioManifest: result.studioManifest,
      type: 'success',
    })
  } catch (error) {
    debug('Error deploying studio schemas and manifests', error)
    const validation = await extractValidationFromSchemaError(error, options.workDir)
    port.postMessage({
      // The Error itself can't cross the worker boundary — serialize its cause
      // chain so transport detail (e.g. ETIMEDOUT) survives alongside the message.
      causes: flattenErrorCauses(error),
      error: error instanceof Error ? error.message : String(error),
      type: 'error',
      validation,
    })
  }
}

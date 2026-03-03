import {isMainThread, parentPort, workerData} from 'node:worker_threads'

import {getStudioWorkspaces, resolveLocalPackage, subdebug} from '@sanity/cli-core'
import {type ClientConfig, createClient, type SanityClient} from '@sanity/client'
import {type StudioManifest, type Workspace} from 'sanity'

import {resolveIcon} from './iconResolver.js'
import {generateManifestWorkerData} from './types.js'

type SanitySdk = typeof import('sanity')

if (isMainThread || !parentPort) {
  throw new Error('This module must be run as a worker thread')
}

const debug = subdebug('generate-studio-manifest')

interface UploadSchemasSuccess {
  descriptors: Map<string, string>
  type: 'success'
}

interface WorkerError {
  message: string
  type: 'error'

  workspaceName?: string
}

/**
 * Uploads schemas to Lexicon and returns workspace name → descriptor ID mapping.
 * Returns a structured result to allow proper error handling.
 */
async function uploadSchemasToLexicon(
  workspaces: Workspace[],
  client: SanityClient,
  uploadSchema: SanitySdk['uploadSchema'],
): Promise<UploadSchemasSuccess | WorkerError> {
  const schemaDescriptors = new Map<string, string>()

  for (const workspace of workspaces) {
    // Use the workspace's schema directly (already resolved)
    const workspaceClient = client.withConfig({
      dataset: workspace.dataset,
      projectId: workspace.projectId,
      useProjectHostname: true,
    })

    try {
      const descriptorId = await uploadSchema(workspace.schema, workspaceClient)

      if (!descriptorId) {
        return {
          message: `Failed to get schema descriptor ID for workspace "${workspace.name}": upload returned empty result`,
          type: 'error',
          workspaceName: workspace.name,
        }
      }

      schemaDescriptors.set(workspace.name, descriptorId)
      debug(
        `Uploaded schema for workspace "${workspace.name}" to Lexicon with descriptor ID: ${descriptorId}`,
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      return {
        message: `Failed to upload schema for workspace "${workspace.name}": ${errorMessage}`,
        type: 'error',
        workspaceName: workspace.name,
      }
    }
  }

  return {descriptors: schemaDescriptors, type: 'success'}
}

const {clientConfig, configPath, sanityVersion, workDir} =
  generateManifestWorkerData.parse(workerData)

try {
  const {generateStudioManifest, uploadSchema} = await resolveLocalPackage<typeof import('sanity')>(
    'sanity',
    workDir,
  )

  // Load workspaces once
  const workspaces = await getStudioWorkspaces(configPath)

  if (workspaces.length === 0) {
    parentPort.postMessage({
      message: 'No workspaces found in studio configuration',
      type: 'error',
    } satisfies WorkerError)
    process.exit(0)
  }

  // Create client from passed config
  const client = createClient({
    ...(clientConfig as Partial<ClientConfig>),
    requestTagPrefix: 'sanity.cli.deploy',
  })

  // Upload schemas to Lexicon and collect descriptor IDs
  const schemaDescriptorsResult = await uploadSchemasToLexicon(workspaces, client, uploadSchema)

  if (schemaDescriptorsResult.type === 'error') {
    parentPort.postMessage(schemaDescriptorsResult)
    process.exit(0)
  }

  const schemaDescriptors = schemaDescriptorsResult.descriptors

  // Pre-resolve icons for all workspaces so resolveIcon can be called synchronously
  const resolvedIcons = new Map<string, string | undefined>()
  await Promise.all(
    workspaces.map(async (workspace) => {
      const icon =
        (await resolveIcon({
          icon: workspace.icon,
          subtitle: workspace.subtitle,
          title: workspace.title ?? workspace.name,
          workDir,
        })) ?? undefined
      resolvedIcons.set(workspace.name, icon)
    }),
  )

  // Generate studio manifest using the shared utility
  const manifest = await generateStudioManifest({
    buildId: JSON.stringify(Date.now()),
    bundleVersion: sanityVersion,
    resolveIcon: (workspace) => resolvedIcons.get(workspace.name),
    resolveSchemaDescriptorId: (workspace) => schemaDescriptors.get(workspace.name),
    workspaces,
  })

  parentPort.postMessage({
    // Return null if no workspaces have schema descriptors
    studioManifest: manifest.workspaces.length === 0 ? undefined : manifest,
    type: 'success',
  } satisfies {studioManifest: StudioManifest | undefined; type: 'success'})
} catch (err) {
  const message = err instanceof Error ? err.message : 'Unknown error occurred'
  parentPort.postMessage({
    message,
    type: 'error',
  } satisfies WorkerError)
}

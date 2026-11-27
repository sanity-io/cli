import {styleText} from 'node:util'

import {ux} from '@oclif/core/ux'
import {
  doImport,
  getGlobalCliClient,
  getLocalPackageVersion,
  loadStudioCliTooling,
  subdebug,
} from '@sanity/cli-core'
import {type DescriptorRequester, prepareSchemaUpload} from '@sanity/schema/_internal'
import {type StudioManifest, type Workspace} from 'sanity'

/** Matches `SCHEMA_DESCRIPTOR_API_VERSION` in `@sanity/cli` and the default in `@sanity/schema`. */
const SCHEMA_DESCRIPTOR_API_VERSION = 'v2025-06-01'

const iconResolverPath = new URL('../manifest/iconResolver.js', import.meta.url).href

export interface UploadSchemaToLexiconListeners {
  onGenerateManifestDone: () => void
  onGenerateManifestFail: (error: unknown) => void
  onGenerateManifestStart: () => void
}

interface UploadSchemaToLexiconOptions {
  workDir: string
  workspaces: Workspace[]

  listeners?: UploadSchemaToLexiconListeners

  verbose?: boolean
}

const debug = subdebug('uploadSchemaToLexicon')

/**
 * Uploads the schemas to Lexicon and returns the studio manifest
 * @param options - The options for the uploadSchemaToLexicon function
 * @returns The studio manifest
 */
export async function uploadSchemaToLexicon(
  options: UploadSchemaToLexiconOptions,
): Promise<StudioManifest | null> {
  const {verbose, workDir, workspaces} = options
  options.listeners?.onGenerateManifestStart()

  try {
    const schemaDescriptors = new Map<string, string>()

    const client = await getGlobalCliClient({
      apiVersion: SCHEMA_DESCRIPTOR_API_VERSION,
      requestTagPrefix: 'sanity.cli.deploy',
      requireUser: true,
    })

    const [bundleVersion, {generateStudioManifest}] = await Promise.all([
      getLocalPackageVersion('sanity', workDir),
      loadStudioCliTooling(workDir),
    ])

    if (!bundleVersion) {
      throw new Error('Failed to find sanity version')
    }

    // `prepareSchemaUpload` prefixes paths with `/${apiVersion}`, while `client.request`
    // already scopes requests to `apiVersion` — strip the leading segment so it isn't doubled.
    const versionPrefix = `/${SCHEMA_DESCRIPTOR_API_VERSION}`
    const requester: DescriptorRequester = <T>(
      requestOptions: Parameters<DescriptorRequester>[0],
    ) =>
      client.request<T>({
        body: requestOptions.body,
        headers: requestOptions.headers
          ? Object.fromEntries(new Headers(requestOptions.headers).entries())
          : undefined,
        method: requestOptions.method,
        signal: requestOptions.signal,
        url: requestOptions.url.startsWith(`${versionPrefix}/`)
          ? requestOptions.url.slice(versionPrefix.length)
          : requestOptions.url,
      })

    for (const workspace of workspaces) {
      try {
        debug('Uploading schema to lexicon for workspace %o', {
          dataset: workspace.dataset,
          projectId: workspace.projectId,
        })
        const {descriptorId} = await prepareSchemaUpload(workspace.schema, {
          apiVersion: SCHEMA_DESCRIPTOR_API_VERSION,
          claim: 'temporary',
          contextKey: `dataset:${workspace.projectId}:${workspace.dataset}`,
          requester,
        })

        if (!descriptorId) {
          throw new Error(
            `Failed to get schema descriptor ID for workspace "${workspace.name}": upload returned empty result`,
          )
        }

        schemaDescriptors.set(workspace.name, descriptorId)
        debug(
          `Uploaded schema for workspace "${workspace.name}" to Lexicon with descriptor ID: ${descriptorId}`,
        )
      } catch (error) {
        debug('Error uploading schema to lexicon for workspace %o', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        throw new Error(
          `Failed to upload schema for workspace "${workspace.name}": ${errorMessage}`,
          {cause: error},
        )
      }
    }

    // Lazy import to avoid pulling in @sanity/ui at module load time
    const {resolveIcon} = await doImport(iconResolverPath)

    // Generate studio manifest using the shared utility
    const manifest = await generateStudioManifest({
      buildId: JSON.stringify(Date.now()),
      bundleVersion,
      // @todo replace with import from @sanity/schema/_internal in future
      resolveIcon: async (workspace) =>
        (await resolveIcon({
          icon: workspace.icon,
          subtitle: workspace.subtitle,
          title: workspace.title || workspace.name || 'default',
          workDir,
        })) ?? undefined,
      resolveSchemaDescriptorId: (workspace) => schemaDescriptors.get(workspace.name),
      workspaces,
    })

    options.listeners?.onGenerateManifestDone()

    const studioManifest = manifest.workspaces.length === 0 ? null : manifest

    if (verbose) {
      if (studioManifest) {
        for (const workspace of studioManifest.workspaces) {
          ux.stdout(
            styleText(
              'gray',
              `↳ projectId: ${workspace.projectId}, dataset: ${workspace.dataset}, schemaDescriptorId: ${workspace.schemaDescriptorId}`,
            ),
          )
        }
      } else {
        ux.stdout(`${styleText('gray', '↳ No workspaces found')}`)
      }
    }

    return studioManifest
  } catch (error) {
    options.listeners?.onGenerateManifestFail(error)
    throw error
  }
}

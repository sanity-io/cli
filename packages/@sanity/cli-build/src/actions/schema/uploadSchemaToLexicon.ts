import {styleText} from 'node:util'

import {ux} from '@oclif/core/ux'
import {
  doImport,
  getLocalPackageVersion,
  getProjectCliClient,
  resolveLocalPackage,
  subdebug,
} from '@sanity/cli-core'
import {flattenErrorCauses, formatErrorCauses} from '@sanity/cli-core/errors'
import {spinner} from '@sanity/cli-core/ux'
import {type StudioManifest, type Workspace} from 'sanity'

/** This version corresponds to the one used in the cli schema service but was copied here to avoid the dependency issue. */
const SCHEMA_API_VERSION = 'v2025-03-01'

const iconResolverPath = new URL('../manifest/iconResolver.js', import.meta.url).href

interface UploadSchemaToLexiconOptions {
  projectId: string
  workDir: string
  workspaces: Workspace[]

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
  const {projectId, verbose, workDir, workspaces} = options
  const spin = spinner('Uploading workspace schemas').start()

  try {
    const schemaDescriptors = new Map<string, string>()

    const client = await getProjectCliClient({
      apiVersion: SCHEMA_API_VERSION,
      projectId,
      requestTagPrefix: 'sanity.cli.deploy',
      requireUser: true,
    })

    const [bundleVersion, {generateStudioManifest, uploadSchema}] = await Promise.all([
      getLocalPackageVersion('sanity', workDir),
      resolveLocalPackage<typeof import('sanity')>('sanity', workDir),
    ])

    if (!bundleVersion) {
      throw new Error('Failed to find sanity version')
    }

    for (const workspace of workspaces) {
      const workspaceClient = client.withConfig({
        dataset: workspace.dataset,
        projectId: workspace.projectId,
      })

      try {
        debug('Uploading schema to lexicon for workspace %o', {
          dataset: workspace.dataset,
          projectId: workspace.projectId,
        })
        // The local `sanity` package types its client against its own
        // @sanity/client major; the runtime surface uploadSchema uses is
        // compatible across v7/v8.
        const descriptorId = await uploadSchema(
          workspace.schema,
          workspaceClient as unknown as Parameters<typeof uploadSchema>[1],
        )

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
        // Name the resolved request URL and the underlying transport cause (e.g.
        // ETIMEDOUT, EAI_AGAIN) — a bare "fetch failed" is undiagnosable.
        const requestUrl = workspaceClient.getUrl('').replace(/\/$/, '')
        const causeDetail = formatErrorCauses(flattenErrorCauses(error))
        throw new Error(
          `Failed to upload schema for workspace "${workspace.name}" (project "${workspace.projectId}", dataset "${workspace.dataset}") to ${requestUrl}: ${errorMessage}${causeDetail ? ` (caused by ${causeDetail})` : ''}`,
          {cause: error},
        )
      }
    }

    spin.text = 'Generating studio manifest'

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

    spin.succeed('Generated studio manifest')

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
    spin.fail(error instanceof Error ? error.message : 'Unknown error')
    throw error
  }
}

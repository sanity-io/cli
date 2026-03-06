import {styleText} from 'node:util'

import {ux} from '@oclif/core/ux'
import {getProjectCliClient, resolveLocalPackage, subdebug} from '@sanity/cli-core'
import {spinner} from '@sanity/cli-core/ux'
import {type StudioManifest, type Workspace} from 'sanity'

import {SCHEMA_API_VERSION} from '../../services/schemas.js'
import {getLocalPackageVersion} from '../../util/getLocalPackageVersion.js'
import {resolveIcon} from '../manifest/iconResolver.js'

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
  const spin = spinner('Generating studio manifest').start()

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
      const descriptorId = await uploadSchema(workspace.schema, workspaceClient)

      if (!descriptorId) {
        spin.fail(
          'Failed to get schema descriptor ID for workspace "${workspace.name}": upload returned empty result',
        )
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
      spin.fail(error instanceof Error ? error.message : 'Unknown error')
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(
        `Failed to upload schema for workspace "${workspace.name}": ${errorMessage}`,
        {cause: error},
      )
    }
  }

  // Generate studio manifest using the shared utility
  const manifest = await generateStudioManifest({
    buildId: JSON.stringify(Date.now()),
    bundleVersion,
    resolveIcon: async (workspace) =>
      // @todo replace with import from @sanity/schema/_internal in future
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
}

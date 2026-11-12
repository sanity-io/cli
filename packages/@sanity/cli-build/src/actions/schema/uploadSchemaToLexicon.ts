import {styleText} from 'node:util'

import {ux} from '@oclif/core/ux'
import {
  doImport,
  getGlobalCliClient,
  getLocalPackageVersion,
  getProjectCliClient,
  resolveLocalPackage,
  subdebug,
} from '@sanity/cli-core'
import {prepareSchemaUpload} from '@sanity/schema/_internal'
import {type StudioManifest, type Workspace} from 'sanity'

import {type SchemaUploadScope} from './types.js'

/** This version corresponds to the one used in the cli schema service but was copied here to avoid the dependency issue. */
const SCHEMA_API_VERSION = 'v2025-03-01'
const DESCRIPTOR_API_VERSION = 'v2025-06-01'

const iconResolverPath = new URL('../manifest/iconResolver.js', import.meta.url).href

interface BaseUploadSchemaToLexiconOptions {
  onGenerateManifestDone: () => void
  onGenerateManifestFail: (error: unknown) => void
  onGenerateManifestStart: () => void

  workDir: string
  workspaces: Workspace[]

  verbose?: boolean
}
/** Uploads through the project-scoped API host using the studio's `uploadSchema`. */
interface ProjectUploadSchemaToLexiconOptions extends BaseUploadSchemaToLexiconOptions {
  projectId: string
  scope: Extract<SchemaUploadScope, 'project'>
}
/** Uploads through the global API host using `@sanity/schema`; not tied to a project. */
interface GlobalUploadSchemaToLexiconOptions extends BaseUploadSchemaToLexiconOptions {
  claimType: Parameters<typeof prepareSchemaUpload>[1]['claim']
  scope: Extract<SchemaUploadScope, 'global'>
}
type UploadSchemaToLexiconOptions =
  | GlobalUploadSchemaToLexiconOptions
  | ProjectUploadSchemaToLexiconOptions

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
  options.onGenerateManifestStart()

  try {
    const [bundleVersion, {generateStudioManifest, uploadSchema}] = await Promise.all([
      getLocalPackageVersion('sanity', workDir),
      resolveLocalPackage<typeof import('sanity')>('sanity', workDir),
    ])

    if (!bundleVersion) {
      throw new Error('Failed to find sanity version')
    }

    const schemaDescriptors =
      options.scope === 'global'
        ? await sanitySchemaToLexicon(options)
        : await clientUploadToLexicon({...options, uploadSchema})

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

    options.onGenerateManifestDone()

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
    options.onGenerateManifestFail(error)
    throw error
  }
}

async function sanitySchemaToLexicon(
  options: GlobalUploadSchemaToLexiconOptions,
): Promise<Map<string, string>> {
  const schemaDescriptors = new Map<string, string>()

  const client = await getGlobalCliClient({
    apiVersion: DESCRIPTOR_API_VERSION,
    requireUser: true,
  })

  for (const workspace of options.workspaces) {
    const schema = workspace.schema

    const contextKey = `dataset:${workspace.projectId}:${workspace.dataset}`

    await tryUpload(workspace, async () => {
      const {commit, descriptorId} = await prepareSchemaUpload(schema, {
        apiVersion: DESCRIPTOR_API_VERSION,
        claim: 'temporary',
        contextKey,
        requester: ({body, headers, method, url}) =>
          client.request({
            body,
            headers: Object.fromEntries(new Headers(headers)),
            method,
            // The helper includes the API version; the client adds it itself.
            url: url!.replace(`/${DESCRIPTOR_API_VERSION}/`, '/'),
          }),
      })

      if (commit) await commit()

      debug(
        'Uploaded schema for workspace "%s" to Lexicon with descriptor ID: %s',
        workspace.name,
        descriptorId,
      )

      schemaDescriptors.set(workspace.name, descriptorId)
    })
  }

  return schemaDescriptors
}

async function clientUploadToLexicon(
  options: ProjectUploadSchemaToLexiconOptions & {
    uploadSchema: (typeof import('sanity'))['uploadSchema']
  },
): Promise<Map<string, string>> {
  const {projectId, uploadSchema, workspaces} = options

  const schemaDescriptors = new Map<string, string>()

  const client = await getProjectCliClient({
    apiVersion: SCHEMA_API_VERSION,
    projectId,
    requestTagPrefix: 'sanity.cli.deploy',
    requireUser: true,
  })

  for (const workspace of workspaces) {
    const workspaceClient = client.withConfig({
      dataset: workspace.dataset,
      projectId: workspace.projectId,
    })

    await tryUpload(workspace, async () => {
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
    })
  }

  return schemaDescriptors
}

async function tryUpload(workspace: Workspace, upload: () => Promise<void>) {
  try {
    await upload()
  } catch (error) {
    debug('Error uploading schema to lexicon for workspace %o', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`Failed to upload schema for workspace "${workspace.name}": ${errorMessage}`, {
      cause: error,
    })
  }
}

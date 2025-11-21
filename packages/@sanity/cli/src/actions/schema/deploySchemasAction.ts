import {type SanityClient} from '@sanity/client'
import chalk from 'chalk'
import partition from 'lodash/partition'

import {
  type ManifestWorkspaceFile,
  SANITY_WORKSPACE_SCHEMA_TYPE,
  type StoredWorkspaceSchema,
} from '../../manifest/manifestTypes.js'
import {type CliCommandContext, type CliOutputter} from '../../types.js'
import {type SchemaStoreActionResult, type SchemaStoreContext} from './schemaStoreTypes.js'
import {createManifestExtractor, ensureManifestExtractSatisfied} from './utils/mainfestExtractor.js'
import {type CreateManifestReader, createManifestReader} from './utils/manifestReader.js'
import {createSchemaApiClient} from './utils/schemaApiClient.js'
import {
  FlagValidationError,
  parseDeploySchemasConfig,
  type SchemaStoreCommonFlags,
  throwWriteProjectIdMismatch,
} from './utils/schemaStoreValidation.js'
import {getWorkspaceSchemaId} from './utils/workspaceSchemaId.js'

export interface DeploySchemasFlags extends SchemaStoreCommonFlags {
  'id-prefix'?: string
  'schema-required'?: boolean
  workspace?: string
}

export default function deploySchemasActionForCommand(
  flags: DeploySchemasFlags,
  context: CliCommandContext,
): Promise<SchemaStoreActionResult> {
  return deploySchemasAction(
    {
      ...flags,
      //invoking the command through CLI implies that schema is required
      'schema-required': true,
    },
    {
      ...context,
      manifestExtractor: createManifestExtractor(context),
    },
  )
}

/**
 *
 * Stores schemas for configured workspaces into workspace datasets.
 *
 * Workspaces are determined by on-disk manifest file – not directly from sanity.config.
 * All schema store actions require a manifest to exist, so we regenerate it by default.
 * Manifest generation can be optionally disabled with --no-manifest-extract.
 * In this case the command uses and existing file or throws when missing.
 */
export async function deploySchemasAction(
  flags: DeploySchemasFlags,
  context: SchemaStoreContext,
): Promise<SchemaStoreActionResult> {
  const {extractManifest, idPrefix, manifestDir, schemaRequired, verbose, workspaceName} =
    parseDeploySchemasConfig(flags, context)

  const {apiClient, jsonReader, manifestExtractor, output} = context

  // prettier-ignore
  if (!(await ensureManifestExtractSatisfied({extractManifest, manifestDir, manifestExtractor, output, schemaRequired,}))) {
    return 'failure'
  }

  try {
    const {client, projectId} = createSchemaApiClient(apiClient)
    const manifestReader = createManifestReader({jsonReader, manifestDir, output})
    const manifest = await manifestReader.getManifest()

    const storeWorkspaceSchema = createStoreWorkspaceSchema({
      client,
      idPrefix,
      manifestReader,
      output,
      projectId,
      verbose,
    })

    const targetWorkspaces = manifest.workspaces.filter(
      (workspace) => !workspaceName || workspace.name === workspaceName,
    )

    if (targetWorkspaces.length === 0) {
      const error = workspaceName
        ? new FlagValidationError(`Found no workspaces named "${workspaceName}"`)
        : new Error(`Workspace array in manifest is empty.`)
      throw error
    }

    //known caveat: we _dont_ rollback failed operations or partial success
    const results = await Promise.allSettled(
      targetWorkspaces.map(async (workspace: ManifestWorkspaceFile): Promise<void> => {
        await storeWorkspaceSchema(workspace)
      }),
    )

    const [successes, failures] = partition(results, (result) => result.status === 'fulfilled')
    if (failures.length > 0) {
      throw new Error(
        `Failed to deploy ${failures.length}/${targetWorkspaces.length} schemas. Successfully deployed ${successes.length}/${targetWorkspaces.length} schemas.`,
      )
    }

    output.success(`Deployed ${successes.length}/${targetWorkspaces.length} schemas`)
    return 'success'
  } catch (err) {
    if (schemaRequired || err instanceof FlagValidationError) {
      throw err
    } else {
      output.print(`↳ Error when storing schemas:\n  ${err.message}`)
      return 'failure'
    }
  } finally {
    output.print(
      `${chalk.gray('↳ List deployed schemas with:')} ${chalk.cyan('sanity schema list')}`,
    )
  }
}

function createStoreWorkspaceSchema(args: {
  client: SanityClient
  idPrefix?: string
  manifestReader: CreateManifestReader
  output: CliOutputter
  projectId: string
  verbose: boolean
}): (workspace: ManifestWorkspaceFile) => Promise<void> {
  const {client, idPrefix, manifestReader, output, projectId, verbose} = args

  return async (workspace) => {
    const {idWarning, safeId: id} = getWorkspaceSchemaId({idPrefix, workspaceName: workspace.name})
    if (idWarning) output.warn(idWarning)

    try {
      throwWriteProjectIdMismatch(workspace, projectId)
      const schema = await manifestReader.getWorkspaceSchema(workspace.name)

      const storedWorkspaceSchema: StoredWorkspaceSchema = {
        _id: id,
        _type: SANITY_WORKSPACE_SCHEMA_TYPE,
        // we have to stringify the schema to save on attribute paths
        schema: JSON.stringify(schema),
        workspace,
      }

      await client
        .withConfig({dataset: workspace.dataset, projectId: workspace.projectId})
        .createOrReplace(storedWorkspaceSchema)

      if (verbose) {
        output.print(
          chalk.gray(`↳ schemaId: ${id}, projectId: ${projectId}, dataset: ${workspace.dataset}`),
        )
      }
    } catch (err) {
      output.error(
        `↳ Error deploying schema for workspace "${workspace.name}":\n  ${chalk.red(`${err.message}`)}`,
      )
      throw err
    }
  }
}

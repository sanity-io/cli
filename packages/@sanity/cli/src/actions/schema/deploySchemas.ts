import {type SanityClient} from '@sanity/client'
import chalk from 'chalk'

import {type DeploySchemaCommand} from '../../commands/schema/deploy'
import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  type ManifestWorkspaceFile,
  type StoredWorkspaceSchema,
} from '../manifest/types.js'
import {type SchemaStoreActionResult, type SchemaStoreContext} from './schemaStoreTypes.js'
import {ensureManifestExtractSatisfied} from './utils/manifestExtractor.js'
import {type CreateManifestReader, createManifestReader} from './utils/manifestReader.js'
import {createSchemaApiClient} from './utils/schemaApiClient.js'
import {
  FlagValidationError,
  parseDeploySchemasConfig,
  SCHEMA_PERMISSION_HELP_TEXT,
} from './utils/schemaStoreValidation.js'
import {getWorkspaceSchemaId} from './utils/workspaceSchemaId.js'

export async function deploySchemas(
  flags: DeploySchemaCommand['flags'],
  context: SchemaStoreContext,
): Promise<SchemaStoreActionResult> {
  const {extractManifest, manifestDir, schemaRequired, tag, verbose, workspaceName} =
    parseDeploySchemasConfig(flags, context)
  const {apiClient, jsonReader, manifestExtractor, output} = context

  if (
    !(await ensureManifestExtractSatisfied({
      extractManifest,
      manifestDir,
      manifestExtractor,
      output,
      schemaRequired,
    }))
  ) {
    return 'failure'
  }

  try {
    const manifestReader = await createManifestReader({
      jsonReader,
      manifestDir,
      output,
      // workDir,
    })
    const manifest = await manifestReader.getManifest()
    const workspaces = manifest.workspaces.filter(
      (workspace) => !workspaceName || workspace.name === workspaceName,
    )

    if (workspaces.length === 0) {
      const error = workspaceName
        ? new FlagValidationError(`Found no workspaces named "${workspaceName}"`)
        : new Error(`Workspace array in manifest is empty.`)
      throw error
    }

    const {client} = await createSchemaApiClient(apiClient)

    const updateSchema = getUpdateSchema({
      client,
      manifestReader,
      output,
      tag,
      verbose,
    })

    /* Known caveat: we _don't_ rollback failed operations or partial success */
    const results = await Promise.allSettled(
      workspaces.map(async (workspace: ManifestWorkspaceFile): Promise<void> => {
        await updateSchema(workspace)
      }),
    )

    const fulfilledUpdates = results.filter((result) => result.status === 'fulfilled')
    const rejectedUpdates = results.filter((result) => result.status === 'rejected')

    if (rejectedUpdates.length > 0) {
      throw new Error(
        `Failed to deploy ${rejectedUpdates.length}/${workspaces.length} schemas. Successfully deployed ${fulfilledUpdates.length}/${workspaces.length} schemas.`,
      )
    }

    output.log(`Deployed ${fulfilledUpdates.length}/${workspaces.length} schemas`)
    return 'success'
  } catch (err) {
    if (schemaRequired || err instanceof FlagValidationError) {
      throw err
    } else {
      output.log(`↳ Error when storing schemas:\n  ${err.message}`)
      return 'failure'
    }
  } finally {
    output.log(`${chalk.gray('↳ List deployed schemas with:')} ${chalk.cyan('sanity schema list')}`)
  }
}

function getUpdateSchema(args: {
  client: SanityClient
  manifestReader: CreateManifestReader
  output: DeploySchemaCommand['flags']['output']
  tag?: string
  verbose: boolean
}): (workspace: ManifestWorkspaceFile) => Promise<void> {
  const {client, manifestReader, output, tag, verbose} = args

  return async (workspace) => {
    const {dataset, projectId} = workspace

    const {idWarning, safeBaseId: id} = getWorkspaceSchemaId({
      tag,
      workspaceName: workspace.name,
    })

    if (idWarning) output.warn(idWarning)

    try {
      const schema = await manifestReader.getWorkspaceSchema(workspace.name)

      const schemas: Omit<StoredWorkspaceSchema, '_id' | '_type'>[] = [
        {
          // the API will stringify the schema – we send as JSON
          schema,
          tag,
          version: CURRENT_WORKSPACE_SCHEMA_VERSION,
          workspace: {
            name: workspace.name,
            title: workspace.title,
          },
        },
      ]

      await client.withConfig({dataset, projectId}).request({
        body: {
          schemas,
        },
        method: 'PUT',
        url: `/projects/${projectId}/datasets/${dataset}/schemas`,
      })

      if (verbose) {
        output.print(chalk.gray(`↳ schemaId: ${id}, projectId: ${projectId}, dataset: ${dataset}`))
      }
    } catch (err) {
      if ('statusCode' in err && err?.statusCode === 401) {
        output.error(
          `↳ No permissions to write schema for workspace "${workspace.name}" in dataset "${workspace.dataset}". ${
            SCHEMA_PERMISSION_HELP_TEXT
          }:\n  ${chalk.red(`${err.message}`)}`,
        )
      } else {
        output.error(
          `↳ Error deploying schema for workspace "${workspace.name}":\n  ${chalk.red(`${err.message}`)}`,
        )
      }

      throw err
    }
  }
}

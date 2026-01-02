import {type Output} from '@sanity/cli-core'
import {chalk} from '@sanity/cli-core/ux'

import {type DeploySchemaCommand} from '../../commands/schema/deploy'
import {updateSchemas} from '../../services/schemas.js'
import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  type ManifestWorkspaceFile,
  type StoredWorkspaceSchema,
} from '../manifest/types.js'
import {type SchemaStoreActionResult} from './schemaStoreTypes.js'
import {schemasDeployDebug} from './utils/debug.js'
import {ensureManifestExtractSatisfied} from './utils/manifestExtractor.js'
import {type CreateManifestReader, createManifestReader} from './utils/manifestReader.js'
import {FlagValidationError, SCHEMA_PERMISSION_HELP_TEXT} from './utils/schemaStoreValidation.js'
import {getWorkspaceSchemaId} from './utils/workspaceSchemaId.js'

interface DeploySchemasOptions {
  extractManifest: boolean
  manifestDir: string
  output: Output
  verbose: boolean
  workDir: string

  manifestSafe?: boolean
  schemaRequired?: boolean
  tag?: string
  workspaceName?: string
}

export async function deploySchemas(
  options: DeploySchemasOptions,
): Promise<SchemaStoreActionResult> {
  const {
    extractManifest,
    manifestDir,
    manifestSafe,
    output,
    schemaRequired,
    tag,
    verbose,
    workDir,
    workspaceName,
  } = options

  if (
    !(await ensureManifestExtractSatisfied({
      extractManifest,
      manifestDir,
      manifestSafe,
      output,
      schemaRequired,
      workDir,
    }))
  ) {
    return 'failure'
  }

  try {
    const manifestReader = await createManifestReader({
      manifestDir,
      output,
      workDir,
    })
    const manifest = await manifestReader.getManifest()
    const workspaces = manifest.workspaces.filter(
      (workspace) => !workspaceName || workspace.name === workspaceName,
    )

    if (workspaces.length === 0) {
      const error = workspaceName
        ? new FlagValidationError(`Found no workspaces named "${workspaceName}"`)
        : new Error('Workspace array in manifest is empty.')
      throw error
    }

    const updateSchema = getUpdateSchema({
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
      output.error(err.message)
    } else {
      output.error(`↳ Error when storing schemas:\n  ${err.message}`)
    }
    schemasDeployDebug('Error updating schemas', err.message)
    return 'failure'
  } finally {
    output.log(`${chalk.gray('↳ List deployed schemas with:')} ${chalk.cyan('sanity schema list')}`)
  }
}

function getUpdateSchema(args: {
  manifestReader: CreateManifestReader
  output: DeploySchemaCommand['flags']['output']
  tag?: string
  verbose: boolean
}): (workspace: ManifestWorkspaceFile) => Promise<void> {
  const {manifestReader, output, tag, verbose} = args

  return async (workspace) => {
    const {dataset, projectId} = workspace

    const {idWarning, safeBaseId: id} = getWorkspaceSchemaId({
      tag,
      workspaceName: workspace.name,
    })

    if (idWarning) output.warn(idWarning)

    try {
      const schema = await manifestReader.getWorkspaceSchema(workspace.name)

      await updateSchemas<Omit<StoredWorkspaceSchema, '_id' | '_type'>[]>(dataset, projectId, [
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
      ])

      if (verbose) {
        output.log(chalk.gray(`↳ schemaId: ${id}, projectId: ${projectId}, dataset: ${dataset}`))
      }
    } catch (err) {
      if ('statusCode' in err && err?.statusCode === 401) {
        output.warn(
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

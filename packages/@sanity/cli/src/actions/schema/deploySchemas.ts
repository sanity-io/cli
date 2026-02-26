import {styleText} from 'node:util'

import {type Output, studioWorkerTask} from '@sanity/cli-core'
import {type SchemaValidationProblemGroup} from '@sanity/types'
import {type Workspace} from 'sanity'

import {updateSchemas} from '../../services/schemas.js'
import {CURRENT_WORKSPACE_SCHEMA_VERSION, type StoredWorkspaceSchema} from '../manifest/types.js'
import {type SchemaStoreActionResult} from './schemaStoreTypes.js'
import {type ExtractWorkspaceWorkerData} from './types.js'
import {schemasDeployDebug} from './utils/debug.js'
import {FlagValidationError, SCHEMA_PERMISSION_HELP_TEXT} from './utils/schemaStoreValidation.js'
import {getWorkspaceSchemaId} from './utils/workspaceSchemaId.js'

interface DeploySchemasOptions {
  output: Output
  verbose: boolean
  workDir: string

  schemaRequired?: boolean
  tag?: string
  workspaceName?: string
}

type ExtractWorkspaceWorkerMessage =
  | {
      error: string
      type: 'error'
      validation?: SchemaValidationProblemGroup[]
    }
  | {
      type: 'success'
      workspaces: Workspace[]
    }

export async function deploySchemas(
  options: DeploySchemasOptions,
): Promise<SchemaStoreActionResult> {
  const {output, schemaRequired, tag, verbose, workDir, workspaceName} = options

  try {
    const result = await studioWorkerTask<ExtractWorkspaceWorkerMessage>(
      new URL('extractSanityWorkspace.worker.js', import.meta.url),
      {
        name: 'extractSanityWorkspace',
        studioRootPath: workDir,
        workerData: {
          configPath: workDir,
          workDir,
        } satisfies ExtractWorkspaceWorkerData,
      },
    )

    if (result.type === 'error') {
      throw new Error(result.error)
    }

    const workspaces = result.workspaces.filter(
      (workspace) => !workspaceName || workspace.name === workspaceName,
    )
    if (workspaces.length === 0) {
      const error = workspaceName
        ? new FlagValidationError(`Found no workspaces named "${workspaceName}"`)
        : new Error('Workspace array in manifest is empty.')
      throw error
    }

    /* Known caveat: we _don't_ rollback failed operations or partial success */
    const results = await Promise.allSettled(
      workspaces.map(async (workspace): Promise<void> => {
        await updateWorkspaceSchema({
          output,
          tag,
          verbose,
          workspace,
        })
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
      output.error(err.message, {exit: 1})
    } else {
      output.error(`↳ Error when storing schemas:\n  ${err.message}`, {exit: 1})
    }
    schemasDeployDebug('Error updating schemas', err.message)
    return 'failure'
  } finally {
    output.log(
      `${styleText('gray', '↳ List deployed schemas with:')} ${styleText('cyan', 'sanity schema list')}`,
    )
  }
}

async function updateWorkspaceSchema(args: {
  output: Output
  tag?: string
  verbose: boolean
  workspace: Workspace
}) {
  const {output, tag, verbose, workspace} = args

  const {dataset, projectId} = workspace

  const {idWarning, safeBaseId: id} = getWorkspaceSchemaId({
    tag,
    workspaceName: workspace.name,
  })

  if (idWarning) output.warn(idWarning)

  try {
    await updateSchemas<Omit<StoredWorkspaceSchema, '_id' | '_type'>[]>(dataset, projectId, [
      {
        // the API will stringify the schema – we send as JSON
        schema: workspace.schema,
        tag,
        version: CURRENT_WORKSPACE_SCHEMA_VERSION,
        workspace: {
          name: workspace.name,
          title: workspace.title,
        },
      },
    ])

    if (verbose) {
      output.log(
        styleText('gray', `↳ schemaId: ${id}, projectId: ${projectId}, dataset: ${dataset}`),
      )
    }
  } catch (err) {
    if ('statusCode' in err && err?.statusCode === 401) {
      output.warn(
        `↳ No permissions to write schema for workspace "${workspace.name}" in dataset "${workspace.dataset}". ${
          SCHEMA_PERMISSION_HELP_TEXT
        }:\n  ${styleText('red', `${err.message}`)}`,
      )
    } else {
      output.error(
        `↳ Error deploying schema for workspace "${workspace.name}":\n  ${styleText('red', `${err.message}`)}`,
      )
    }

    throw err
  }
}

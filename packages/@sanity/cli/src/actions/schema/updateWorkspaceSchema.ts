import {styleText} from 'node:util'

import {ux} from '@oclif/core/ux'
import {spinner} from '@sanity/cli-core/ux'
import partition from 'lodash-es/partition.js'

import {updateSchemas} from '../../services/schemas.js'
import {
  CURRENT_WORKSPACE_SCHEMA_VERSION,
  type ManifestSchemaType,
  type StoredWorkspaceSchema,
} from '../manifest/types.js'
import {SCHEMA_PERMISSION_HELP_TEXT} from './utils/schemaStoreValidation.js'
import {getWorkspaceSchemaId} from './utils/workspaceSchemaId.js'

/**
 * Workspace metadata + pre-extracted manifest schema for deployment.
 * The schema must already be in ManifestSchemaType[] format (extracted from
 * the live Schema object before any structured clone boundary).
 */
export interface WorkspaceSchemaInput {
  dataset: string
  manifestSchema: ManifestSchemaType[]
  name: string
  projectId: string

  title?: string
}

/**
 * Updates the schemas for a list of workspaces.
 */
export async function updateWorkspacesSchemas(args: {
  tag?: string
  verbose: boolean
  workspaces: WorkspaceSchemaInput[]
}) {
  const {tag, verbose, workspaces} = args

  /* Known caveat: we _don't_ rollback failed operations or partial success */
  const results = await Promise.allSettled(
    workspaces.map(async (workspace): Promise<void> => {
      await updateWorkspaceSchema({
        tag,
        verbose,
        workspace,
      })
    }),
  )

  const [fulfilledUpdates, rejectedUpdates] = partition(
    results,
    (result) => result.status === 'fulfilled',
  )

  if (rejectedUpdates.length > 0) {
    throw new Error(
      `Failed to deploy ${rejectedUpdates.length}/${workspaces.length} schemas. Successfully deployed ${fulfilledUpdates.length}/${workspaces.length} schemas.`,
    )
  }

  spinner(`Deployed ${fulfilledUpdates.length}/${workspaces.length} schemas`).succeed()
}

/**
 * Updates a workspace schema in the dataset.
 */
async function updateWorkspaceSchema(args: {
  tag?: string
  verbose: boolean
  workspace: WorkspaceSchemaInput
}) {
  const {tag, verbose, workspace} = args

  const {dataset, manifestSchema, projectId} = workspace

  const {idWarning, safeBaseId: id} = getWorkspaceSchemaId({
    tag,
    workspaceName: workspace.name,
  })

  if (idWarning) ux.warn(idWarning)

  try {
    await updateSchemas<Omit<StoredWorkspaceSchema, '_id' | '_type'>[]>(dataset, projectId, [
      {
        // the API will stringify the schema – we send as JSON
        schema: manifestSchema,
        tag,
        version: CURRENT_WORKSPACE_SCHEMA_VERSION,
        workspace: {
          name: workspace.name,
          title: workspace.title,
        },
      },
    ])

    if (verbose) {
      ux.stdout(
        styleText('gray', `↳ schemaId: ${id}, projectId: ${projectId}, dataset: ${dataset}`),
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (
      err instanceof Error &&
      'statusCode' in err &&
      (err as {statusCode: unknown}).statusCode === 401
    ) {
      ux.warn(
        `↳ No permissions to write schema for workspace "${workspace.name}" in dataset "${workspace.dataset}". ${
          SCHEMA_PERMISSION_HELP_TEXT
        }:\n  ${styleText('red', message)}`,
      )
    } else {
      ux.stdout(
        styleText(
          'red',
          `↳ Error deploying schema for workspace "${workspace.name}":\n  ${styleText('red', message)}`,
        ),
      )
    }

    throw err
  }
}

import {styleText} from 'node:util'

import {CLIError} from '@oclif/core/errors'
import {type Output, studioWorkerTask} from '@sanity/cli-core'
import {type Workspace} from 'sanity'

import {deleteSchema} from '../../services/schemas.js'
import {isDefined} from '../manifest/schemaTypeHelpers.js'
import {type UniqWorkspaceWorkerData} from './types.js'
import {getDatasetsOutString, getStringList} from './utils/schemaStoreOutStrings.js'
import {type WorkspaceSchemaId} from './utils/schemaStoreValidation.js'

// Native implementation instead of lodash/uniq
function uniq<T>(array: T[]): T[] {
  return [...new Set(array)]
}

interface DeleteSchemasOptions {
  configPath: string
  ids: WorkspaceSchemaId[]
  output: Output
  projectId: string
  verbose: boolean
  workDir: string

  dataset?: string
}

interface DeleteResult {
  dataset: string
  deleted: boolean
  schemaId: string
}

class DeleteIdError extends Error {
  public dataset: string
  public id: string
  constructor(id: string, dataset: string, options?: ErrorOptions) {
    super((options?.cause as {message?: string})?.message, options)
    this.name = 'DeleteIdError'
    this.id = id
    this.dataset = dataset
  }
}

export async function deleteSchemaAction(options: DeleteSchemasOptions): Promise<void> {
  const {configPath, dataset, ids, output, projectId, verbose, workDir} = options

  const projectDatasets = await studioWorkerTask<(Workspace & {key: string})[]>(
    new URL('uniqueWorkspaces.worker.js', import.meta.url),
    {
      name: 'uniqueWorkspaces',
      studioRootPath: workDir,
      workerData: {configPath, dataset} satisfies UniqWorkspaceWorkerData,
    },
  )

  const datasets = projectDatasets.map((w) => w.dataset)

  const results = await Promise.allSettled(
    datasets.flatMap((targetDataset: string) => {
      return ids.map(async ({schemaId}): Promise<DeleteResult> => {
        try {
          const deletedSchema = await deleteSchema(targetDataset, projectId, schemaId)
          return {dataset: targetDataset, deleted: deletedSchema.deleted, schemaId}
        } catch (err) {
          throw new DeleteIdError(schemaId, targetDataset, {cause: err})
        }
      })
    }),
  )

  const deletedIds = results
    .filter((r): r is PromiseFulfilledResult<DeleteResult> => r.status === 'fulfilled')
    .filter((r) => r.value.deleted)
    .map((r) => r.value)

  const notFound = uniq(
    results
      .filter((r): r is PromiseFulfilledResult<DeleteResult> => r.status === 'fulfilled')
      .filter((r) => !r.value.deleted)
      .filter((r) => !deletedIds.map(({schemaId}) => schemaId).includes(r.value.schemaId))
      .map((r) => r.value.schemaId),
  )

  const deleteFailureIds = uniq(
    results
      .filter((r) => r.status === 'rejected')
      .map((result) => {
        const error = result.reason
        if (error instanceof DeleteIdError) {
          output.warn(
            styleText(
              'red',
              [
                `Failed to delete schema "${error.id}" in dataset "${error.dataset}":`,
                error.message,
              ].join('\n'),
            ),
          )
          if (verbose) output.warn(error)
          return error.id
        }
        //hubris inc: given the try-catch wrapping the full promise "this should never happen"
        throw error
      }),
  )

  // Compare unique schema IDs deleted vs requested (not total deletions across datasets)
  const uniqueDeletedSchemaIds = uniq(deletedIds.map(({schemaId}) => schemaId))
  const success = uniqueDeletedSchemaIds.length === ids.length
  if (success) {
    output.log(`Successfully deleted ${uniqueDeletedSchemaIds.length}/${ids.length} schemas`)
  } else {
    throw new CLIError(
      [
        `Deleted ${uniqueDeletedSchemaIds.length}/${ids.length} schemas.`,
        deletedIds.length > 0
          ? `Successfully deleted ids:\n${deletedIds
              .map(
                ({dataset: targetDataset, schemaId}) =>
                  `- "${schemaId}" (in ${getDatasetsOutString([targetDataset])})`,
              )
              .join('\n')}`
          : undefined,
        notFound.length > 0
          ? `Ids not found in ${getDatasetsOutString(datasets)}:\n${getStringList(notFound)}`
          : undefined,
        ...(deleteFailureIds.length > 0
          ? [`Failed to delete ids:\n${getStringList(deleteFailureIds)}`, 'Check logs for errors.']
          : []),
      ]
        .filter((item) => isDefined(item))
        .join('\n'),
    )
  }
}

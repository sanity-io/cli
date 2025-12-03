import {type CliCommandContext} from '@sanity/cli'
import chalk from 'chalk'

import {isDefined} from '../manifest/schemaTypeHelpers.js'
import {type SchemaStoreActionResult, type SchemaStoreContext} from './schemaStoreTypes.js'
import {createManifestExtractor, ensureManifestExtractSatisfied} from './utils/manifestExtractor.js'
import {createManifestReader} from './utils/manifestReader.js'
import {createSchemaApiClient} from './utils/schemaApiClient.js'
import {getDatasetsOutString, getStringList} from './utils/schemaStoreOutStrings.js'
import {
  filterLogReadProjectIdMismatch,
  parseDeleteSchemasConfig,
  type SchemaStoreCommonFlags,
} from './utils/schemaStoreValidation.js'

// Native implementation instead of lodash/uniq
function uniq<T>(array: T[]): T[] {
  return [...new Set(array)]
}

export interface DeleteSchemaFlags extends SchemaStoreCommonFlags {
  dataset?: string
  ids?: string
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

export default function deleteSchemasActionForCommand(
  flags: DeleteSchemaFlags,
  context: CliCommandContext,
): Promise<SchemaStoreActionResult> {
  return deleteSchemaAction(flags, {
    ...context,
    manifestExtractor: createManifestExtractor(context),
  })
}

/**
 * Deletes all stored schemas matching --ids in workspace datasets.
 *
 * Workspaces are determined by on-disk manifest file – not directly from sanity.config.
 * All schema store actions require a manifest to exist, so we regenerate it by default.
 * Manifest generation can be optionally disabled with --no-manifest-extract.
 * In this case the command uses and existing file or throws when missing.
 */
export async function deleteSchemaAction(
  flags: DeleteSchemaFlags,
  context: SchemaStoreContext,
): Promise<SchemaStoreActionResult> {
  const {dataset, extractManifest, ids, manifestDir, verbose} = parseDeleteSchemasConfig(
    flags,
    context,
  )
  const {apiClient, jsonReader, manifestExtractor, output} = context

  // prettier-ignore
  if (!(await ensureManifestExtractSatisfied({extractManifest, manifestDir, manifestExtractor,  output, schemaRequired: true,}))) {
    return 'failure'
  }

  const {client, projectId} = createSchemaApiClient(apiClient)
  const manifest = await createManifestReader({jsonReader, manifestDir, output}).getManifest()

  const workspaces = manifest.workspaces
    .filter((workspace) => !dataset || workspace.dataset === dataset)
    .filter((workspace) => filterLogReadProjectIdMismatch(workspace, projectId, output))

  const datasets = uniq(workspaces.map((w) => w.dataset))

  const results = await Promise.allSettled(
    datasets.flatMap((targetDataset: string) => {
      return ids.map(async ({schemaId}): Promise<DeleteResult> => {
        try {
          const deletedSchema = await client.withConfig({dataset: targetDataset}).delete(schemaId)
          return {dataset: targetDataset, deleted: deletedSchema.results.length, schemaId}
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
          output.error(
            chalk.red(
              [
                `Failed to delete schema "${error.id}" in dataset "${error.dataset}":`,
                error.message,
              ].join('\n'),
            ),
          )
          if (verbose) output.error(error)
          return error.id
        }
        //hubris inc: given the try-catch wrapping the full promise "this should never happen"
        throw error
      }),
  )

  const success = deletedIds.length === ids.length
  if (success) {
    output.success(`Successfully deleted ${deletedIds.length}/${ids.length} schemas`)
  } else {
    output.error(
      [
        `Deleted ${deletedIds.length}/${ids.length} schemas.`,
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

  return success ? 'success' : 'failure'
}

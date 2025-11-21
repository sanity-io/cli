import chalk from 'chalk'
import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'

import {isDefined} from '../../manifest/manifestTypeHelpers.js'
import {
  SANITY_WORKSPACE_SCHEMA_TYPE,
  type StoredWorkspaceSchema,
} from '../../manifest/manifestTypes.js'
import {type CliCommandContext, type CliOutputter} from '../../types.js'
import {type SchemaStoreActionResult, type SchemaStoreContext} from './schemaStoreTypes.js'
import {createManifestExtractor, ensureManifestExtractSatisfied} from './utils/mainfestExtractor.js'
import {createManifestReader} from './utils/manifestReader.js'
import {createSchemaApiClient} from './utils/schemaApiClient.js'
import {getDatasetsOutString} from './utils/schemaStoreOutStrings.js'
import {
  filterLogReadProjectIdMismatch,
  parseListSchemasConfig,
  type SchemaStoreCommonFlags,
} from './utils/schemaStoreValidation.js'

export interface SchemaListFlags extends SchemaStoreCommonFlags {
  id?: string
  json?: boolean
}

class DatasetError extends Error {
  public dataset: string
  constructor(dataset: string, options?: ErrorOptions) {
    super((options?.cause as {message?: string})?.message, options)
    this.dataset = dataset
    this.name = 'DatasetError'
  }
}

export default function listSchemasActionForCommand(
  flags: SchemaListFlags,
  context: CliCommandContext,
): Promise<SchemaStoreActionResult> {
  return listSchemasAction(flags, {
    ...context,
    manifestExtractor: createManifestExtractor(context),
  })
}

/**
 * Lists stored schemas found in workspace datasets.
 *
 * Workspaces are determined by on-disk manifest file – not directly from sanity.config.
 * All schema store actions require a manifest to exist, so we regenerate it by default.
 * Manifest generation can be optionally disabled with --no-manifest-extract.
 * In this case the command uses and existing file or throws when missing.
 */
export async function listSchemasAction(
  flags: SchemaListFlags,
  context: SchemaStoreContext,
): Promise<SchemaStoreActionResult> {
  const {extractManifest, id, json, manifestDir} = parseListSchemasConfig(flags, context)
  const {apiClient, jsonReader, manifestExtractor, output} = context

  // prettier-ignore
  if (!(await ensureManifestExtractSatisfied({extractManifest, manifestDir, manifestExtractor,  output, schemaRequired: true,}))) {
    return 'failure'
  }
  const {client, projectId} = createSchemaApiClient(apiClient)

  const manifest = await createManifestReader({jsonReader, manifestDir, output}).getManifest()
  const workspaces = manifest.workspaces.filter((workspace) =>
    filterLogReadProjectIdMismatch(workspace, projectId, output),
  )

  const datasets = uniq(workspaces.map((w) => w.dataset))

  const schemaResults = await Promise.allSettled(
    datasets.map(async (dataset: string) => {
      try {
        const datasetClient = client.withConfig({dataset})
        return id
          ? datasetClient.getDocument<StoredWorkspaceSchema>(id)
          : datasetClient.fetch<StoredWorkspaceSchema[]>(`*[_type == $type]`, {
              type: SANITY_WORKSPACE_SCHEMA_TYPE,
            })
      } catch (error) {
        throw new DatasetError(dataset, {cause: error})
      }
    }),
  )

  const schemas = schemaResults
    .map(
      (
        result: PromiseSettledResult<
          never[] | StoredWorkspaceSchema | StoredWorkspaceSchema[] | null | undefined
        >,
      ): never[] | StoredWorkspaceSchema | StoredWorkspaceSchema[] | null | undefined => {
        if (result.status === 'fulfilled') return result.value

        if (result.reason instanceof DatasetError) {
          const message = chalk.red(
            `↳ Failed to fetch schema from dataset "${result.reason.dataset}":\n  ${result.reason.message}`,
          )
          output.error(message)
        } else {
          //hubris inc: given the try-catch wrapping all the full promise "this should never happen"
          throw result.reason
        }
        return []
      },
    )
    .filter(
      (
        item: never[] | StoredWorkspaceSchema | StoredWorkspaceSchema[] | null | undefined,
      ): item is StoredWorkspaceSchema | StoredWorkspaceSchema[] => isDefined(item),
    )
    .flat()

  if (schemas.length === 0) {
    const datasetString = getDatasetsOutString(datasets)
    output.error(
      id
        ? `Schema for id "${id}" not found in ${datasetString}`
        : `No schemas found in ${datasetString}`,
    )
    return 'failure'
  }

  if (json) {
    output.print(`${JSON.stringify(id ? schemas[0] : schemas, null, 2)}`)
  } else {
    printSchemaList({output, schemas})
  }
  return 'success'
}

function printSchemaList({
  output,
  schemas,
}: {
  output: CliOutputter
  schemas: StoredWorkspaceSchema[]
}) {
  const ordered = sortBy(
    schemas.map(({_createdAt: createdAt, _id: id, workspace}) => {
      return [id, workspace.name, workspace.dataset, workspace.projectId, createdAt].map(String)
    }),
    ['createdAt'],
  )
  const headings = ['Id', 'Workspace', 'Dataset', 'ProjectId', 'CreatedAt']
  const rows = ordered.toReversed()

  // Calculate max widths for each column
  const maxWidths = headings.map((str) => str.length)
  for (const row of rows) {
    for (const [i, element] of row.entries()) {
      maxWidths[i] = Math.max(maxWidths[i], element.length)
    }
  }

  const rowToString = (row: string[]) =>
    row.map((col, i) => `${col}`.padEnd(maxWidths[i])).join('   ')

  output.print(chalk.cyan(rowToString(headings)))
  for (const row of rows) output.print(rowToString(row))
}

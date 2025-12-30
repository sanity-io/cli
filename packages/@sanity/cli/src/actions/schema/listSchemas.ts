import {Output} from '@sanity/cli-core'
import {chalk} from '@sanity/cli-core/ux'

import {type ListSchemaCommand} from '../../commands/schema/list.js'
import {getSchemas} from '../../services/schemas.js'
import {isDefined} from '../manifest/schemaTypeHelpers.js'
import {
  type CreateManifest,
  type ManifestWorkspaceFile,
  type StoredWorkspaceSchema,
} from '../manifest/types.js'
import {type SchemaStoreActionResult, type SchemaStoreContext} from './schemaStoreTypes.js'
import {ensureManifestExtractSatisfied} from './utils/manifestExtractor.js'
import {createManifestReader} from './utils/manifestReader.js'
import {getDatasetsOutString} from './utils/schemaStoreOutStrings.js'
import {parseListSchemasConfig, SCHEMA_PERMISSION_HELP_TEXT} from './utils/schemaStoreValidation.js'
import {uniqByProjectIdDataset} from './utils/uniqByProjectIdDataset.js'

class DatasetError extends Error {
  public dataset: string
  public projectId: string
  constructor(args: {dataset: string; options?: ErrorOptions; projectId: string}) {
    super((args.options?.cause as {message?: string})?.message, args.options)
    this.projectId = args.projectId
    this.dataset = args.dataset
    this.name = 'DatasetError'
  }
}

export async function listSchemas(
  flags: ListSchemaCommand['flags'],
  context: SchemaStoreContext,
): Promise<SchemaStoreActionResult> {
  const {extractManifest, id, json, manifestDir} = parseListSchemasConfig(flags)
  const {jsonReader, manifestExtractor, output, workDir} = context

  if (
    !(await ensureManifestExtractSatisfied({
      extractManifest,
      manifestDir,
      manifestExtractor,
      output,
      schemaRequired: true,
    }))
  ) {
    return 'failure'
  }

  const manifest = await createManifestReader({
    jsonReader,
    manifestDir,
    output,
    workDir,
  }).getManifest()
  const projectDatasets = uniqByProjectIdDataset(manifest.workspaces)
  const schemas = (await getDatasetSchemas(
    projectDatasets,
    id,
  )) as unknown as StoredWorkspaceSchema[]
  const parsedSchemas = parseSchemas(schemas, output) as unknown as StoredWorkspaceSchema[]

  if (parsedSchemas.length === 0) {
    const datasetString = getDatasetsOutString(projectDatasets.map((dataset) => dataset.dataset))

    output.error(
      id
        ? `Schema for id "${id}" not found in ${datasetString}`
        : `No schemas found in ${datasetString}`,
    )

    return 'failure'
  }

  if (json) {
    output.log(`${JSON.stringify(id ? parsedSchemas[0] : parsedSchemas, null, 2)}`)
  } else {
    printSchemas({manifest, output, schemas: parsedSchemas})
  }

  return 'success'
}

async function getDatasetSchemas(
  projectDatasets: ManifestWorkspaceFile[],
  id?: ListSchemaCommand['flags']['id'],
) {
  return await Promise.allSettled(
    projectDatasets.map(async ({dataset, projectId}) => {
      try {
        return await getSchemas(dataset, projectId, id)
      } catch (error) {
        throw new DatasetError({dataset, options: {cause: error}, projectId})
      }
    }),
  )
}

function parseSchemas(schemas: StoredWorkspaceSchema[], output: Output) {
  return schemas
    .map((schema) => {
      if (schema.status === 'fulfilled') return schema.value

      const error = schema.reason

      if (error instanceof DatasetError) {
        if (
          'cause' in error &&
          error.cause &&
          typeof error.cause === 'object' &&
          'statusCode' in error.cause &&
          error.cause.statusCode === 401
        ) {
          output.warn(
            `↳ No permissions to read schema from "${error.dataset}". ${
              SCHEMA_PERMISSION_HELP_TEXT
            }:\n  ${chalk.red(`${error.message}`)}`,
          )
          return []
        }

        const message = chalk.red(
          `↳ Failed to fetch schema from "${error.dataset}":\n  ${error.message}`,
        )
        output.error(message)
      } else {
        //hubris inc: given the try-catch wrapping all the full promise "this should never happen"
        throw error
      }
      return []
    })
    .filter((schema) => isDefined(schema))
    .flat()
}

function printSchemas({
  manifest,
  output,
  schemas,
}: {
  manifest: CreateManifest
  output: Output
  schemas: StoredWorkspaceSchema[]
}) {
  const rows = schemas
    .toSorted((a, b) => -(a._createdAt || '').localeCompare(b._createdAt || ''))
    .map(({_createdAt: createdAt, _id: id, workspace}) => {
      const workspaceData = manifest.workspaces.find((w) => w.name === workspace.name)

      if (!workspaceData) return

      return [id, workspace.name, workspaceData.dataset, workspaceData.projectId, createdAt].map(
        String,
      )
    })
    .filter((schema) => isDefined(schema))

  const headings = ['Id', 'Workspace', 'Dataset', 'ProjectId', 'CreatedAt']

  const maxWidths = headings.map((heading, i) => {
    const widths = [...rows.map((row) => row[i].length), heading.length]
    return Math.max(...widths)
  })

  const rowToString = (row: string[]) =>
    row.map((col, i) => `${col}`.padEnd(maxWidths[i])).join('   ')

  output.log(chalk.cyan(rowToString(headings)))
  for (const row of rows) output.log(rowToString(row))
}

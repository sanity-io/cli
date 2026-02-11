import {styleText} from 'node:util'

import {type Output, studioWorkerTask} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {Table} from 'console-table-printer'
import {type Workspace} from 'sanity'

import {getSchemas} from '../../services/schemas.js'
import {isDefined} from '../manifest/schemaTypeHelpers.js'
import {type StoredWorkspaceSchema} from '../manifest/types.js'
import {type UniqWorkspaceWorkerData} from './types.js'
import {getDatasetsOutString} from './utils/schemaStoreOutStrings.js'
import {SCHEMA_PERMISSION_HELP_TEXT} from './utils/schemaStoreValidation.js'

interface ListSchemasOptions {
  configPath: string
  json: boolean
  output: Output
  workDir: string

  id?: string
}

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

export async function listSchemas(options: ListSchemasOptions): Promise<void> {
  const {configPath, id, json, output, workDir} = options

  const projectDatasets = await studioWorkerTask<(Workspace & {key: string})[]>(
    new URL('uniqueWorkspaces.worker.js', import.meta.url),
    {
      name: 'uniqueWorkspaces',
      studioRootPath: workDir,
      workerData: {configPath} satisfies UniqWorkspaceWorkerData,
    },
  )

  const schemas = await getDatasetSchemas(projectDatasets, id)
  const parsedSchemas = parseSchemas(schemas, output)

  if (parsedSchemas.length === 0) {
    const datasetString = getDatasetsOutString(projectDatasets.map((dataset) => dataset.dataset))

    throw new Error(
      id
        ? `Schema for id "${id}" not found in ${datasetString}`
        : `No schemas found in ${datasetString}`,
    )
  }

  if (json) {
    output.log(JSON.stringify(id ? parsedSchemas[0] : parsedSchemas, null, 2))
  } else {
    printSchemas({output, schemas: parsedSchemas, workspaces: projectDatasets})
  }
}

async function getDatasetSchemas(projectDatasets: Workspace[], id?: string) {
  return Promise.allSettled(
    projectDatasets.map(async ({dataset, projectId}) => {
      try {
        return await getSchemas(dataset, projectId, id)
      } catch (error) {
        throw new DatasetError({dataset, options: {cause: error}, projectId})
      }
    }),
  )
}

function parseSchemas(schemas: PromiseSettledResult<StoredWorkspaceSchema[]>[], output: Output) {
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
          output.log(
            styleText(
              'yellow',
              `${logSymbols.warning} ↳ No permissions to read schema from "${error.dataset}". ${
                SCHEMA_PERMISSION_HELP_TEXT
              }:\n  ${styleText('red', `${error.message}`)}`,
            ),
          )
          return []
        }

        output.log(
          styleText('red', `↳ Failed to fetch schema from "${error.dataset}":\n  ${error.message}`),
        )
        return []
      } else {
        //hubris inc: given the try-catch wrapping all the full promise "this should never happen"
        throw error
      }
    })
    .filter((schema) => isDefined(schema))
    .flat()
}

function printSchemas({
  output,
  schemas,
  workspaces,
}: {
  output: Output
  schemas: StoredWorkspaceSchema[]
  workspaces: Workspace[]
}) {
  const rows = schemas
    .toSorted((a, b) => -(a._createdAt || '').localeCompare(b._createdAt || ''))
    .map(({_createdAt: createdAt, _id: id, workspace}) => {
      const workspaceData = workspaces.find((w) => w.name === workspace.name)
      if (!workspaceData) return

      return {
        CreatedAt: createdAt,
        Dataset: workspaceData.dataset,
        Id: id,
        ProjectId: workspaceData.projectId,
        Workspace: workspace.name,
      }
    })
    .filter((schema) => isDefined(schema))

  const table = new Table({
    columns: [
      {alignment: 'left', name: 'Id'},
      {alignment: 'left', name: 'Workspace'},
      {alignment: 'left', name: 'Dataset'},
      {alignment: 'left', name: 'ProjectId'},
      {alignment: 'left', name: 'CreatedAt'},
    ],
  })

  table.addRows(rows)
  output.log(table.render())
}

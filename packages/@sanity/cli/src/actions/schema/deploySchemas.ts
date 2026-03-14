import {studioWorkerTask} from '@sanity/cli-core'
import {type SchemaValidationProblemGroup} from '@sanity/types'
import {type Workspace} from 'sanity'

import {type ManifestSchemaType} from '../manifest/types.js'
import {type ExtractWorkspaceWorkerData} from './types.js'
import {updateWorkspacesSchemas, type WorkspaceSchemaInput} from './updateWorkspaceSchema.js'
import {SchemaExtractionError} from './utils/SchemaExtractionError.js'

interface DeploySchemasOptions {
  verbose: boolean
  workDir: string

  tag?: string
  workspaceName?: string
}

type WorkspaceWithManifest = Workspace & {manifestSchema: ManifestSchemaType[]}

type ExtractWorkspaceWorkerMessage =
  | {
      error: string
      type: 'error'
      validation?: SchemaValidationProblemGroup[]
    }
  | {
      type: 'success'
      workspaces: WorkspaceWithManifest[]
    }

export async function deploySchemas(options: DeploySchemasOptions): Promise<void> {
  const {tag, verbose, workDir, workspaceName} = options

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
    throw new SchemaExtractionError(result.error, result.validation)
  }

  const workspaces: WorkspaceSchemaInput[] = result.workspaces
    .filter((workspace) => !workspaceName || workspace.name === workspaceName)
    .map((workspace) => ({
      dataset: workspace.dataset,
      manifestSchema: workspace.manifestSchema,
      name: workspace.name,
      projectId: workspace.projectId,
      title: workspace.title,
    }))

  if (workspaces.length === 0) {
    const error = workspaceName
      ? new Error(`Found no workspaces named "${workspaceName}"`)
      : new Error('No workspaces found')
    throw error
  }

  await updateWorkspacesSchemas({
    tag,
    verbose,
    workspaces,
  })
}

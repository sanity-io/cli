import {getProjectCliClient} from '@sanity/cli-core'
import {type DatasetAclMode} from '@sanity/client'

export const DATASET_API_VERSION = 'v2025-09-16'

function getDatasetClient(projectId: string) {
  return getProjectCliClient({
    apiVersion: DATASET_API_VERSION,
    projectId,
    requireUser: true,
  })
}

export async function listDatasets(projectId: string) {
  const client = await getDatasetClient(projectId)
  return client.datasets.list()
}

export interface DatasetAliasDefinition {
  datasetName: string | null
  name: string
}

export async function listDatasetAliases(projectId: string): Promise<DatasetAliasDefinition[]> {
  const client = await getDatasetClient(projectId)
  return client.request<DatasetAliasDefinition[]>({uri: '/aliases'})
}

interface DeleteDatasetOptions {
  datasetName: string
  projectId: string
}

export async function deleteDataset({datasetName, projectId}: DeleteDatasetOptions) {
  const client = await getDatasetClient(projectId)
  return client.datasets.delete(datasetName)
}

interface EditDatasetAclOptions {
  aclMode: 'private' | 'public'
  datasetName: string
  projectId: string
}

export async function editDatasetAcl({aclMode, datasetName, projectId}: EditDatasetAclOptions) {
  const client = await getDatasetClient(projectId)
  return client.datasets.edit(datasetName, {aclMode})
}

interface CreateDatasetOptions {
  datasetName: string
  projectId: string

  aclMode?: DatasetAclMode
}

export async function createDataset({aclMode, datasetName, projectId}: CreateDatasetOptions) {
  const client = await getDatasetClient(projectId)

  if (aclMode) {
    return client.datasets.create(datasetName, {aclMode})
  }

  return client.datasets.create(datasetName)
}

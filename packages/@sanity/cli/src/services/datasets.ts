import {getProjectCliClient} from '@sanity/cli-core'

const DATASET_API_VERSION = 'v2025-09-16'

const getDatasetClient = async (projectId: string) => {
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

interface DeleteDatasetOptions {
  datasetName: string
  projectId: string
}

export async function deleteDataset({datasetName, projectId}: DeleteDatasetOptions) {
  const client = await getDatasetClient(projectId)
  return client.datasets.delete(datasetName)
}

import {getProjectCliClient} from '@sanity/cli-core'

export const DATASET_ALIASES_API_VERSION = 'v2025-09-16'
export const ALIAS_PREFIX = '~'

interface DatasetAliasDefinition {
  datasetName: string | null
  name: string
}

interface DatasetModificationResponse {
  aliasName: string
  datasetName: string | null
}

const getAliasClient = async (projectId: string) => {
  return getProjectCliClient({
    apiVersion: DATASET_ALIASES_API_VERSION,
    projectId,
    requireUser: true,
  })
}

export async function listAliases(projectId: string): Promise<DatasetAliasDefinition[]> {
  const client = await getAliasClient(projectId)
  return client.request<DatasetAliasDefinition[]>({uri: '/aliases'})
}

export async function createAlias(
  projectId: string,
  aliasName: string,
  datasetName: string | null,
): Promise<DatasetModificationResponse> {
  const client = await getAliasClient(projectId)
  return client.request({
    body: datasetName ? {datasetName} : undefined,
    method: 'PUT',
    uri: `/aliases/${aliasName}`,
  })
}

/**
 * Updates an existing dataset alias to link to a different dataset
 * @param projectId - The project ID containing the alias
 * @param aliasName - The name of the alias to update (without ~ prefix)
 * @param datasetName - The name of the dataset to link the alias to
 * @returns Promise resolving to the updated alias information
 */
export async function updateAlias(
  projectId: string,
  aliasName: string,
  datasetName: string,
): Promise<DatasetModificationResponse> {
  const client = await getAliasClient(projectId)
  return client.request<DatasetModificationResponse>({
    body: {datasetName},
    method: 'PATCH',
    uri: `/aliases/${aliasName}`,
  })
}

/**
 * Unlinks an existing dataset alias from its dataset
 * @param projectId - The project ID containing the alias
 * @param aliasName - The name of the alias to unlink (without ~ prefix)
 * @returns Promise resolving to the unlink response with dataset name that was unlinked
 */
export async function unlinkAlias(
  projectId: string,
  aliasName: string,
): Promise<DatasetModificationResponse> {
  const client = await getAliasClient(projectId)
  return client.request<DatasetModificationResponse>({
    body: {},
    method: 'PATCH',
    uri: `/aliases/${aliasName}/unlink`,
  })
}

export async function removeAlias(
  projectId: string,
  aliasName: string,
): Promise<{deleted: boolean}> {
  const client = await getAliasClient(projectId)
  return client.request<{deleted: boolean}>({
    method: 'DELETE',
    uri: `/aliases/${aliasName}`,
  })
}

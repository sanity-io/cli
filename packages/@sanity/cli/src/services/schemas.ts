import {getGlobalCliClient} from '@sanity/cli-core'

import {type StoredWorkspaceSchema} from '../actions/manifest/types.js'

export const SCHEMA_API_VERSION = 'v2025-03-01'

async function getSchemaClient() {
  return await getGlobalCliClient({
    apiVersion: SCHEMA_API_VERSION,
    requireUser: true,
  })
}

export async function getSchemas(dataset: string, projectId: string, id?: string) {
  const client = await getSchemaClient()

  return client.request<StoredWorkspaceSchema[]>({
    method: 'GET',
    uri: `/projects/${projectId}/datasets/${dataset}/schemas${id ? `/${id}` : ''}`,
  })
}

export async function deleteSchema(dataset: string, projectId: string, id: string) {
  const exists = await getSchemas(dataset, projectId, id)

  if (exists?.length === 0) {
    return {
      deleted: false,
    }
  }

  const client = await getSchemaClient()

  return client.request({
    method: 'DELETE',
    uri: `/projects/${projectId}/datasets/${dataset}/schemas/${id}`,
  })
}

export async function updateSchemas<T>(dataset: string, projectId: string, schemas: T) {
  const client = await getSchemaClient()

  return client.request({
    body: {
      schemas: schemas,
    },
    method: 'PUT',
    url: `/projects/${projectId}/datasets/${dataset}/schemas`,
  })
}

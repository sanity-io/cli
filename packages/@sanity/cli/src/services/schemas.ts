import {getGlobalCliClient} from '@sanity/cli-core'

export const SCHEMA_API_VERSION = 'v2025-03-01'

async function getSchemaClient() {
  return await getGlobalCliClient({
    apiVersion: SCHEMA_API_VERSION,
    requireUser: true,
  })
}

export async function getSchemas<T>(dataset: string, projectId: string, id?: string) {
  const client = await getSchemaClient()

  return id
    ? await client.request<T | undefined>({
        method: 'GET',
        uri: `/projects/${projectId}/datasets/${dataset}/schemas/${id}`,
      })
    : await client.request<T[] | undefined>({
        method: 'GET',
        uri: `/projects/${projectId}/datasets/${dataset}/schemas`,
      })
}

export async function deleteSchema(dataset: string, projectId: string, id: string) {
  const client = await getSchemaClient()

  return await client.request({
    method: 'DELETE',
    uri: `/projects/${projectId}/datasets/${dataset}/schemas/${id}`,
  })
}

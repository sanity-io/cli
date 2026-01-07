import {getGlobalCliClient} from '@sanity/cli-core'

export const CORS_API_VERSION = 'v2025-08-14'

interface CreateCorsOriginOptions {
  allowCredentials: boolean
  origin: string
  projectId: string
}

export async function createCorsOrigin({
  allowCredentials,
  origin,
  projectId,
}: CreateCorsOriginOptions) {
  const client = await getGlobalCliClient({
    apiVersion: CORS_API_VERSION,
    requireUser: true,
  })

  return client.request({
    body: {
      allowCredentials,
      origin,
    },
    maxRedirects: 0,
    method: 'POST',
    uri: `/projects/${projectId}/cors`,
  })
}

interface DeleteCorsOriginOptions {
  originId: number
  projectId: string
}

export async function deleteCorsOrigin({originId, projectId}: DeleteCorsOriginOptions) {
  const client = await getGlobalCliClient({
    apiVersion: CORS_API_VERSION,
    requireUser: true,
  })

  return client.request({
    method: 'DELETE',
    uri: `/projects/${projectId}/cors/${originId}`,
  })
}

export interface CorsOrigin {
  allowCredentials: boolean
  createdAt: string
  deletedAt: string | null
  id: number
  origin: string
  projectId: string
  updatedAt: string | null
}

export async function listCorsOrigins(projectId: string) {
  const client = await getGlobalCliClient({
    apiVersion: CORS_API_VERSION,
    requireUser: true,
  })

  return client.request<CorsOrigin[]>({uri: `/projects/${projectId}/cors`})
}

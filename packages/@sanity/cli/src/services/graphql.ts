import {getProjectCliClient} from '@sanity/cli-core'

import {
  type DeployResponse,
  type GeneratedApiSpecification,
  type ValidationResponse,
} from '../actions/graphql/types.js'
import {getUrlHeaders} from './getUrlHeaders.js'

export const GRAPHQL_API_VERSION = 'v2025-09-19'

export interface GraphQLEndpoint {
  dataset: string
  generation: string
  playgroundEnabled: boolean
  projectId: string
  tag: string
}

/**
 * List all GraphQL endpoints for a project
 * @param client - The API client to use for the request
 * @returns A promise that resolves to an array of GraphQL endpoints
 *
 * @internal
 */
export async function listGraphQLEndpoints(projectId: string): Promise<GraphQLEndpoint[]> {
  const client = await getProjectCliClient({
    apiVersion: GRAPHQL_API_VERSION,
    projectId,
    requireUser: true,
  })

  return client.request<GraphQLEndpoint[]>({
    method: 'GET',
    uri: '/apis/graphql',
  })
}

interface DeleteGraphQLAPIOptions {
  dataset: string
  projectId: string
  tag: string
}

export async function deleteGraphQLAPI({dataset, projectId, tag}: DeleteGraphQLAPIOptions) {
  const client = await getProjectCliClient({
    apiVersion: GRAPHQL_API_VERSION,
    projectId,
    requireUser: true,
  })

  return client.request({
    method: 'DELETE',
    uri: `/apis/graphql/${dataset}/${tag}`,
  })
}

export async function validateGraphQLAPI({
  dataset,
  enablePlayground,
  projectId,
  schema,
  tag,
}: {
  dataset: string
  enablePlayground: boolean
  projectId: string
  schema: GeneratedApiSpecification
  tag: string
}) {
  const client = await getProjectCliClient({
    apiVersion: GRAPHQL_API_VERSION,
    projectId,
    requireUser: true,
  })

  return client.request<ValidationResponse>({
    body: {enablePlayground, schema},
    maxRedirects: 0,
    method: 'POST',
    url: `/apis/graphql/${dataset}/${tag}/validate`,
  })
}

interface DeployGraphQLAPIOptions {
  dataset: string
  enablePlayground: boolean
  projectId: string
  schema: GeneratedApiSpecification
  tag: string
}

export async function deployGraphQLAPI({
  dataset,
  enablePlayground,
  projectId,
  schema,
  tag,
}: DeployGraphQLAPIOptions) {
  const client = await getProjectCliClient({
    apiVersion: GRAPHQL_API_VERSION,
    projectId,
    requireUser: true,
  })

  return client.request<DeployResponse>({
    body: {enablePlayground, schema},
    maxRedirects: 0,
    method: 'PUT',
    url: `/apis/graphql/${dataset}/${tag}`,
  })
}

export async function getClientUrl(projectId: string, uri: string) {
  const client = await getProjectCliClient({
    apiVersion: GRAPHQL_API_VERSION,
    projectId,
    requireUser: true,
  })

  return `${client.config().url}/${uri.replace(/^\//, '')}`
}

export async function getCurrentSchemaProps(
  projectId: string,
  dataset: string,
  tag: string,
): Promise<{
  currentGeneration?: string
  playgroundEnabled?: boolean
}> {
  try {
    const client = await getProjectCliClient({
      apiVersion: GRAPHQL_API_VERSION,
      projectId,
    })

    const uri = `/apis/graphql/${dataset}/${tag}`
    const config = client.config()
    const apiUrl = `${config.url}/${uri.replace(/^\//, '')}`

    const res = await getUrlHeaders(apiUrl, {
      Authorization: `Bearer ${config.token}`,
    })

    return {
      currentGeneration: res['x-sanity-graphql-generation'],
      playgroundEnabled: res['x-sanity-graphql-playground'] === 'true',
    }
  } catch (err) {
    if (err.statusCode === 404) {
      return {}
    }

    throw err
  }
}

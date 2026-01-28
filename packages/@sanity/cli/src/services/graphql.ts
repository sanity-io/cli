import {getProjectCliClient} from '@sanity/cli-core'

import {
  type DeployResponse,
  type GeneratedApiSpecification,
  type ValidationResponse,
} from '../actions/graphql/types.js'

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

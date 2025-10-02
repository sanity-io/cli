import {getProjectCliClient} from '@sanity/cli-core'

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

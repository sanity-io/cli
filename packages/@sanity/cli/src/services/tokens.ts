import {getGlobalCliClient} from '@sanity/cli-core'

import {type ProjectRole, type Token, type TokenResponse} from '../actions/tokens/types.js'

const TOKENS_API_VERSION = 'v2025-08-18'

interface CreateTokenOptions {
  label: string
  projectId: string
  roleName: string
}

/**
 * Add a token to a project
 * @param options - The options for adding a token to a project
 * @returns A promise that resolves to the token response
 *
 * @internal
 */
export async function createToken(options: CreateTokenOptions): Promise<TokenResponse> {
  const {label, projectId, roleName} = options

  const client = await getGlobalCliClient({
    apiVersion: TOKENS_API_VERSION,
    requireUser: true,
  })

  return client.request<TokenResponse>({
    body: {label, roleName},
    method: 'POST',
    uri: `/projects/${projectId}/tokens`,
  })
}

interface DeleteTokenOptions {
  projectId: string
  tokenId: string
}

/**
 * Delete a token from a project
 * @param options - The options for deleting a token from a project
 * @returns A promise that resolves when the token is deleted
 *
 * @internal
 */
export async function deleteToken(options: DeleteTokenOptions): Promise<void> {
  const {projectId, tokenId} = options

  const client = await getGlobalCliClient({
    apiVersion: TOKENS_API_VERSION,
    requireUser: true,
  })

  return client.request({
    method: 'DELETE',
    uri: `/projects/${projectId}/tokens/${tokenId}`,
  })
}

/**
 * Get all tokens for a project
 * @param projectId - The project ID
 * @returns A promise that resolves to an array of tokens
 *
 * @internal
 */
export async function getTokens(projectId: string): Promise<Token[]> {
  const client = await getGlobalCliClient({
    apiVersion: TOKENS_API_VERSION,
    requireUser: true,
  })

  return client.request<Token[]>({
    uri: `/projects/${projectId}/tokens`,
  })
}

/**
 * Get all roles for a project
 * @param projectId - The project ID
 * @returns A promise that resolves to an array of project roles
 *
 * @internal
 */
export async function getTokenRoles(projectId: string): Promise<ProjectRole[]> {
  const client = await getGlobalCliClient({
    apiVersion: TOKENS_API_VERSION,
    requireUser: true,
  })

  return client.request<ProjectRole[]>({uri: `/projects/${projectId}/roles`})
}

import {getGlobalCliClient, subdebug} from '@sanity/cli-core'
import {isHttpError} from '@sanity/client'

export const MCP_API_VERSION = '2025-12-09'
export const MCP_SERVER_URL = 'https://mcp.sanity.io'
export const MCP_JOURNEY_API_VERSION = 'v2024-02-23'

const debug = subdebug('mcp:service')

interface PostInitPromptResponse {
  message?: string
}

/**
 * Create a child token for MCP usage
 * This token is tied to the parent CLI token and will be invalidated
 * when the parent token is invalidated (e.g., on logout)
 *
 * @returns The MCP token string
 * @internal
 */
export async function createMCPToken(): Promise<string> {
  const client = await getGlobalCliClient({
    apiVersion: MCP_API_VERSION,
    requireUser: true,
  })

  const sessionResponse = await client.request<{id: string; sid: string}>({
    body: {
      sourceId: 'sanity-mcp',
      withStamp: false,
    },
    method: 'POST',
    uri: '/auth/session/create',
  })

  const tokenResponse = await client.request<{label: string; token: string}>({
    method: 'GET',
    query: {sid: sessionResponse.sid},
    uri: '/auth/fetch',
  })

  return tokenResponse.token
}

/**
 * Validate an MCP token by calling /users/me.
 * Returns true if the token is valid, false if 401/403.
 * Throws on network errors or other unexpected failures.
 *
 * @internal
 */
export async function validateMCPToken(token: string): Promise<boolean> {
  const client = await getGlobalCliClient({
    apiVersion: MCP_API_VERSION,
    token,
    unauthenticated: true,
  })

  try {
    await client.users.getById('me')
    return true
  } catch (err) {
    if (isHttpError(err) && (err.statusCode === 401 || err.statusCode === 403)) {
      debug('Token validation failed with %d', err.statusCode)
      return false
    }
    throw err
  }
}

/**
 * Fetches the post-init MCP prompt from the Journey API and interpolates editor names.
 * Falls back to a hardcoded default if the API call fails, times out, or returns empty.
 * Text wrapped in **markers** will be formatted with cyan color.
 */
export async function getPostInitPrompt() {
  const client = await getGlobalCliClient({apiVersion: MCP_JOURNEY_API_VERSION, requireUser: false})
  return await client.request<PostInitPromptResponse | null>({
    method: 'GET',
    timeout: 1000,
    uri: '/journey/mcp/post-init-prompt',
  })
}

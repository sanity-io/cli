import {getGlobalCliClient, subdebug} from '@sanity/cli-core'

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
 * Validate an MCP token against the MCP server.
 *
 * MCP tokens are scoped to mcp.sanity.io and are not valid against
 * api.sanity.io, so we validate against the MCP server itself.
 *
 * Sends a minimal POST with just the Authorization header — the server
 * checks auth before content negotiation, so a valid token gets 406
 * (missing Accept header) while an invalid token gets 401. This avoids
 * the cost of a full initialize handshake.
 *
 * @internal
 */
export async function validateMCPToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(MCP_SERVER_URL, {
      body: '{}',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })

    if (res.status === 401 || res.status === 403) {
      debug('MCP token validation failed with %d', res.status)
      return false
    }

    // 406 (Not Acceptable) means auth passed but content negotiation failed —
    // that's expected and means the token is valid
    return true
  } catch (err) {
    debug('MCP token validation error: %s', err)
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

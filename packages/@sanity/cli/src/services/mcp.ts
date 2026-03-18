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
 * Validate an MCP token by checking it against the Sanity API.
 *
 * MCP tokens are standard Sanity session tokens (`sk…`), so we validate
 * by calling `/users/me` on `api.sanity.io`. A 200 means the token is
 * alive; a 401/403 means it is dead and the caller should prompt for
 * re-configuration.
 *
 * Transient errors (5xx, network failures, timeouts) are rethrown so the
 * caller can decide how to handle them — typically by assuming the token
 * is still valid rather than falsely marking it as expired.
 *
 * We intentionally do NOT probe `mcp.sanity.io` because the MCP server
 * lets invalid bearer tokens through for protocol-compatibility reasons,
 * which causes the CLI to falsely treat dead tokens as valid.
 *
 * @internal
 */
export async function validateMCPToken(token: string): Promise<boolean> {
  const client = await getGlobalCliClient({
    apiVersion: MCP_API_VERSION,
    requireUser: false,
    token,
  })

  try {
    await client.request({timeout: 2500, uri: '/users/me'})
    return true
  } catch (err) {
    // 401/403 definitively mean "dead token"
    if (isHttpError(err) && (err.statusCode === 401 || err.statusCode === 403)) {
      debug('MCP token validation failed with %d', err.statusCode)
      return false
    }

    // Everything else (5xx, network errors, timeouts) is rethrown so the
    // caller can decide — typically assumes valid rather than forcing re-auth.
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

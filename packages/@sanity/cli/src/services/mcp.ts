import {getGlobalCliClient} from '@sanity/cli-core'

export const MCP_SERVER_URL = 'https://mcp.sanity.io'
export const MCP_JOURNEY_API_VERSION = 'v2024-02-23'

interface PostInitPromptResponse {
  message?: string
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
    url: '/journey/mcp/post-init-prompt',
  })
}

import {getGlobalCliClient} from '@sanity/cli-core'

export const MCP_API_VERSION = '2025-12-09'
export const MCP_SERVER_URL = 'https://mcp.sanity.io'

export type EditorName = 'Claude Code' | 'Cursor' | 'VS Code'

export interface Editor {
  configKey: 'mcpServers' | 'servers'
  configPath: string
  name: EditorName
}

export interface MCPConfig {
  mcpServers?: Record<string, ServerConfig>
  servers?: Record<string, ServerConfig>
}

export interface ServerConfig {
  headers: {
    Authorization: string
  }
  type: 'http'
  url: string
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

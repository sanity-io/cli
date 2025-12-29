import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import {subdebug} from '@sanity/cli-core'

import {type Editor, MCP_SERVER_URL, type MCPConfig} from '../../services/mcp.js'

const debug = subdebug('mcp:writeMCPConfig')

/**
 * Write MCP configuration to editor config file
 * Merges with existing config if present
 *
 * @param editor - Editor to configure
 * @param token - MCP authentication token
 */
export async function writeMCPConfig(editor: Editor, token: string): Promise<void> {
  const configPath = editor.configPath

  // 1. Read existing config (if exists)
  let existingConfig: MCPConfig = {}
  if (existsSync(configPath)) {
    try {
      const content = await fs.readFile(configPath, 'utf8')
      existingConfig = JSON.parse(content) as MCPConfig
    } catch {
      debug(`Warning: Could not parse ${configPath}. Creating new config.`)
      // Use empty config (will overwrite)
    }
  }

  // 2. Create/update Sanity server entry
  const serverKey = editor.configKey
  if (!existingConfig[serverKey]) {
    existingConfig[serverKey] = {}
  }

  existingConfig[serverKey]!.Sanity = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    type: 'http',
    url: MCP_SERVER_URL,
  }

  // 3. Ensure parent directory exists
  await fs.mkdir(path.dirname(configPath), {recursive: true})

  // 4. Write config
  await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2), 'utf8')
}

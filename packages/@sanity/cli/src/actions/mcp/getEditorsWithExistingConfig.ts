import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'

import {subdebug} from '@sanity/cli-core'

import {type Editor, type MCPConfig} from '../../services/mcp.js'

const debug = subdebug('mcp:getEditorsWithExistingConfig')

/**
 * Check which editors already have Sanity MCP configured
 *
 * @param editors - Array of editors to check
 * @returns Array of editors that already have Sanity MCP configured
 */
export async function getEditorsWithExistingConfig(editors: Editor[]): Promise<Editor[]> {
  const configured: Editor[] = []

  for (const editor of editors) {
    if (existsSync(editor.configPath)) {
      try {
        const content = await fs.readFile(editor.configPath, 'utf8')
        const config = JSON.parse(content) as MCPConfig
        if (config[editor.configKey]?.Sanity) {
          configured.push(editor)
        }
      } catch (err) {
        debug('Could not read MCP config for %s: %s', editor.name, err)
        // Treat as not configured
      }
    }
  }

  return configured
}

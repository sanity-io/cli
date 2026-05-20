import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'

import {applyEdits, modify} from 'jsonc-parser'
import {parse as parseToml, stringify as stringifyToml} from 'smol-toml'

import {EDITOR_CONFIGS} from './editorConfigs.js'
import {type Editor} from './types.js'

interface TomlConfig {
  [key: string]: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Remove only Sanity's MCP server entry from an editor config file.
 * Other MCP servers and surrounding JSONC comments are preserved.
 */
export async function removeMCPConfig(editor: Editor): Promise<void> {
  const {configKey, format} = EDITOR_CONFIGS[editor.name]

  if (!existsSync(editor.configPath)) {
    return
  }

  let content = await fs.readFile(editor.configPath, 'utf8')
  if (!content.trim()) {
    return
  }

  if (format === 'toml') {
    const tomlConfig = parseToml(content) as TomlConfig
    const existingServers = tomlConfig[configKey]

    if (!isRecord(existingServers) || !Object.hasOwn(existingServers, 'Sanity')) {
      return
    }

    const updatedServers = {...existingServers}
    delete updatedServers.Sanity
    tomlConfig[configKey] = updatedServers

    content = stringifyToml(tomlConfig)
  } else {
    const edits = modify(content, [configKey, 'Sanity'], undefined, {
      formattingOptions: {insertSpaces: true, tabSize: 2},
    })
    if (edits.length === 0) {
      return
    }
    content = applyEdits(content, edits)
  }

  await fs.writeFile(editor.configPath, content, 'utf8')
}

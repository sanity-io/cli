import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'

import {applyEdits, modify, parse as parseJsonc} from 'jsonc-parser'
import {parse as parseToml, stringify as stringifyToml} from 'smol-toml'

import {EDITOR_CONFIGS} from './editorConfigs.js'
import {type Editor} from './types.js'

/**
 * Remove the Sanity MCP server entry from an editor's config file.
 * Other entries are preserved.
 */
export async function removeMCPConfig(editor: Editor): Promise<void> {
  const {configKey, format} = EDITOR_CONFIGS[editor.name]
  const {configPath} = editor

  if (!existsSync(configPath)) return

  const content = await fs.readFile(configPath, 'utf8')
  if (!content.trim()) return

  let updated: string
  if (format === 'toml') {
    const config = parseToml(content) as Record<string, unknown>
    const servers = config[configKey]
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return
    const {Sanity: _removed, ...rest} = servers as Record<string, unknown>
    if (_removed === undefined) return
    config[configKey] = rest
    updated = stringifyToml(config)
  } else {
    // jsonc-parser's `modify` throws when asked to delete a path whose parent
    // doesn't exist, so confirm the Sanity entry is actually present first —
    // keeps this a safe no-op when the config has no (or a different) server map.
    const parsed = parseJsonc(content) as Record<string, unknown> | null
    const servers = parsed?.[configKey]
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return
    if ((servers as Record<string, unknown>).Sanity === undefined) return

    const edits = modify(content, [configKey, 'Sanity'], undefined, {
      formattingOptions: {insertSpaces: true, tabSize: 2},
    })
    if (edits.length === 0) return
    updated = applyEdits(content, edits)
  }

  await fs.writeFile(configPath, updated, 'utf8')
}

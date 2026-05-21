import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import {applyEdits, modify, parse as parseJsonc} from 'jsonc-parser'
import {parse as parseToml, stringify as stringifyToml} from 'smol-toml'

import {EDITOR_CONFIGS} from './editorConfigs.js'
import {Editor} from './types.js'

interface TomlConfig {
  [key: string]: Record<string, unknown> | undefined
}

/**
 * Stable JSON for structural comparison — sorts object keys recursively.
 *
 * Scope: only handles strings and plain nested objects. That is the entire
 * shape produced by `buildServerConfig` across every editor in
 * `EDITOR_CONFIGS` (type/url/headers/etc — no arrays, no null, no numbers).
 * If a future server config grows new value types, extend this here.
 */
function canonical(value: unknown): string {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value)
  const record = value as Record<string, unknown>
  const entries = Object.keys(record)
    .toSorted()
    .map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`)
  return `{${entries.join(',')}}`
}

function readExistingSanityEntry(
  content: string,
  configKey: string,
  format: 'jsonc' | 'toml',
): unknown {
  if (!content.trim()) return undefined
  try {
    const parsed = format === 'toml' ? parseToml(content) : parseJsonc(content)
    const servers = (parsed as Record<string, unknown> | null)?.[configKey]
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) return undefined
    return (servers as Record<string, unknown>).Sanity
  } catch {
    return undefined
  }
}

/**
 * Write MCP configuration to an editor's config file. Returns `true` if the
 * file was written, `false` if the existing Sanity entry already matches and
 * the write was skipped.
 *
 * Note: Config parseability is already validated in detectAvailableEditors().
 */
export async function writeMCPConfig(editor: Editor, token?: string): Promise<boolean> {
  const configPath = editor.configPath
  const {buildServerConfig, configKey, format, oauthOnly} = EDITOR_CONFIGS[editor.name]
  const serverConfig = oauthOnly ? buildServerConfig('') : buildServerConfig(token!)

  const existingContent = existsSync(configPath) ? await fs.readFile(configPath, 'utf8') : ''

  const existingEntry = readExistingSanityEntry(existingContent, configKey, format)
  if (existingEntry && canonical(existingEntry) === canonical(serverConfig)) {
    return false
  }

  let content = existingContent.trim() ? existingContent : format === 'toml' ? '' : '{}'

  if (format === 'toml') {
    const tomlConfig = content.trim() ? (parseToml(content) as TomlConfig) : {}
    const existingServers = tomlConfig[configKey]

    tomlConfig[configKey] = {
      ...(existingServers && typeof existingServers === 'object' ? existingServers : {}),
      Sanity: serverConfig,
    }

    content = stringifyToml(tomlConfig)
  } else {
    const edits = modify(content, [configKey, 'Sanity'], serverConfig, {
      formattingOptions: {insertSpaces: true, tabSize: 2},
    })
    content = applyEdits(content, edits)
  }

  await fs.mkdir(path.dirname(configPath), {recursive: true})
  await fs.writeFile(configPath, content, 'utf8')
  return true
}

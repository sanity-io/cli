import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'

import {subdebug} from '@sanity/cli-core'
import {type ParseError, parse as parseJsonc} from 'jsonc-parser'
import {parse as parseToml} from 'smol-toml'

import {
  createDetectionEnv,
  type DetectionEnv,
  EDITOR_CONFIGS,
  type EditorName,
} from './editorConfigs.js'
import {type Editor} from './types.js'

const debug = subdebug('mcp:detectAvailableEditors')

interface MCPConfig {
  [key: string]: Record<string, unknown> | undefined
}

function isConfigObject(value: unknown): value is MCPConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseTomlConfig(content: string): MCPConfig | null {
  try {
    const parsed = parseToml(content)
    return isConfigObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

function parseJsoncConfig(content: string): MCPConfig | null {
  const errors: ParseError[] = []
  const parsed = parseJsonc(content, errors, {allowTrailingComma: true})

  return errors.length === 0 && isConfigObject(parsed) ? parsed : null
}

/**
 * Safely parse config file content
 * Returns parsed config or null if unparseable
 */
function parseConfig(content: string, format: 'jsonc' | 'toml'): MCPConfig | null {
  const trimmed = content.trim()
  if (trimmed === '') {
    return {} // Empty file - safe to write, treat as empty config
  }

  return format === 'toml' ? parseTomlConfig(content) : parseJsoncConfig(content)
}

async function readConfig(
  name: EditorName,
  configPath: string,
  format: 'jsonc' | 'toml',
): Promise<MCPConfig | null> {
  try {
    const content = await fs.readFile(configPath, 'utf8')
    const config = parseConfig(content, format)
    if (config === null) {
      debug('Skipping %s: could not parse %s', name, configPath)
    }
    return config
  } catch (err) {
    debug('Skipping %s: could not read %s: %s', name, configPath, err)
    return null
  }
}

function readExistingToken(
  sanityConfig: unknown,
  readToken: (serverConfig: Record<string, unknown>) => string | undefined,
): string | undefined {
  return isConfigObject(sanityConfig) ? readToken(sanityConfig) : undefined
}

/**
 * Check if an editor's config is usable and whether Sanity MCP is already configured.
 * If configured, extracts the existing auth token.
 * Returns null only if config exists but can't be parsed (to avoid data loss).
 */
async function checkEditorConfig(name: EditorName, configPath: string): Promise<Editor | null> {
  const {configKey, format, readToken} = EDITOR_CONFIGS[name]

  if (!existsSync(configPath)) {
    return {configPath, configured: false, name}
  }

  const config = await readConfig(name, configPath, format)
  if (config === null) {
    return null
  }

  const sanityConfig = config[configKey]?.Sanity
  const configured = Boolean(sanityConfig)
  const existingToken = readExistingToken(sanityConfig, readToken)
  if (configured && !existingToken) {
    return {authStatus: 'valid', configPath, configured, name}
  }

  return {configPath, configured, existingToken, name}
}

/**
 * Detect which editors are installed and have parseable configs.
 * Editors with unparseable configs are skipped to avoid data loss.
 *
 * Accepts an optional `DetectionEnv` for testability. When omitted,
 * uses the real process/OS environment.
 */
export async function detectAvailableEditors(env?: DetectionEnv): Promise<Editor[]> {
  const ctx = env ?? createDetectionEnv()

  // Detect all editors in parallel to avoid stacking timeouts —
  // CLI-based editors (Claude Code, Codex CLI, OpenCode) each have a
  // 5s execa timeout, so sequential detection can add ~15s on machines
  // where none are installed.
  const results = await Promise.all(
    Object.entries(EDITOR_CONFIGS).map(async ([name, config]) => {
      const configPath = await config.detect(ctx)
      if (!configPath) return null
      return checkEditorConfig(name as EditorName, configPath)
    }),
  )

  return results.filter((editor): editor is Editor => editor !== null)
}

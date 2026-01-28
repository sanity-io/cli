import {existsSync} from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {getCliToken, getGlobalCliClient, Output, subdebug} from '@sanity/cli-core'
import {checkbox, logSymbols} from '@sanity/cli-core/ux'
import {execa} from 'execa'

const debug = subdebug('init:setupMCP')

const MCP_SERVER_URL = 'https://mcp.sanity.io'

const NO_EDITORS_DETECTED_MESSAGE = `Couldn't auto-configure Sanity MCP server for your editor. Visit ${MCP_SERVER_URL} for setup instructions.`

export type EditorName = 'Claude Code' | 'Cursor' | 'VS Code'

export interface Editor {
  configKey: 'mcpServers' | 'servers'
  configPath: string
  name: EditorName
}

interface MCPConfig {
  mcpServers?: Record<string, ServerConfig>
  servers?: Record<string, ServerConfig>
}

interface ServerConfig {
  headers: {
    Authorization: string
  }
  type: 'http'
  url: string
}

export interface MCPSetupResult {
  configuredEditors: EditorName[]
  detectedEditors: EditorName[]
  skipped: boolean

  error?: Error
}

/**
 * Detect which editors are installed on the user's machine
 */
async function detectAvailableEditors(): Promise<Editor[]> {
  const editors: Editor[] = []
  const homeDir = os.homedir()

  // Cursor detection
  const cursorDir = path.join(homeDir, '.cursor')
  if (existsSync(cursorDir)) {
    editors.push({
      configKey: 'mcpServers',
      configPath: path.join(cursorDir, 'mcp.json'),
      name: 'Cursor',
    })
  }

  // VS Code detection (platform-specific)
  let vscodeConfigDir: string | null = null
  switch (process.platform) {
    case 'darwin': {
      vscodeConfigDir = path.join(homeDir, 'Library/Application Support/Code/User')
      break
    }
    case 'win32': {
      // APPDATA is required on Windows for VS Code config path
      if (process.env.APPDATA) {
        vscodeConfigDir = path.join(process.env.APPDATA, 'Code/User')
      }
      break
    }
    default: {
      // linux
      vscodeConfigDir = path.join(homeDir, '.config/Code/User')
    }
  }

  if (vscodeConfigDir && existsSync(vscodeConfigDir)) {
    editors.push({
      configKey: 'servers',
      configPath: path.join(vscodeConfigDir, 'mcp.json'),
      name: 'VS Code',
    })
  }

  // Claude Code detection
  try {
    await execa('claude', ['--version'], {stdio: 'pipe', timeout: 5000})
    editors.push({
      configKey: 'mcpServers',
      configPath: path.join(homeDir, '.claude.json'),
      name: 'Claude Code',
    })
  } catch {
    // Not installed
  }

  return editors
}

/**
 * Prompt user to select which editors to configure
 * Shows existing config status - unconfigured editors are pre-selected,
 * configured editors show "(select to reconfigure)" and are not pre-selected
 */
async function promptForMCPSetup(
  detectedEditors: Editor[],
  editorsWithExisting: Editor[],
): Promise<Editor[] | null> {
  // Build choices with existing config status
  const editorChoices = detectedEditors.map((e) => {
    const isConfigured = editorsWithExisting.some((existing) => existing.name === e.name)
    return {
      checked: !isConfigured, // Only pre-select if NOT already configured
      name: isConfigured ? `${e.name} (already installed)` : e.name,
      value: e.name,
    }
  })

  const result = await checkbox({
    choices: editorChoices,
    message: 'Configure Sanity MCP server?',
  })

  const selectedNames = result

  // User can deselect all to skip
  if (!selectedNames || selectedNames.length === 0) {
    return null
  }

  return detectedEditors.filter((e) => selectedNames.includes(e.name))
}

/**
 * Create a child token for MCP usage
 * This token is tied to the parent CLI token and will be invalidated
 * when the parent token is invalidated (e.g., on logout)
 */
async function createMCPToken(): Promise<string> {
  const parentToken = getCliToken()
  if (!parentToken) {
    throw new Error('Not authenticated. Please run `sanity login` first.')
  }

  const client = await getGlobalCliClient({
    apiVersion: '2025-12-09',
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
 * Check which editors already have Sanity MCP configured
 */
async function getEditorsWithExistingConfig(editors: Editor[]): Promise<Editor[]> {
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

/**
 * Write MCP configuration to editor config file
 * Merges with existing config if present
 * Uses existing CLI authentication token
 */
async function writeMCPConfig(editor: Editor, token: string): Promise<void> {
  const configPath = editor.configPath

  // 1. Read existing config (if exists)
  let existingConfig: MCPConfig = {}
  if (existsSync(configPath)) {
    try {
      const content = await fs.readFile(configPath, 'utf8')
      existingConfig = JSON.parse(content)
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

  existingConfig[serverKey].Sanity = {
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

/**
 * Main MCP setup orchestration
 * Opt-out by default: runs automatically unless skipMcp flag is set
 */
export async function setupMCP(options: {mcp?: boolean; output: Output}): Promise<MCPSetupResult> {
  // 1. Check for explicit opt-out
  if (options.mcp === false) {
    options.output.warn('Skipping MCP configuration due to --no-mcp flag')
    return {
      configuredEditors: [],
      detectedEditors: [],
      skipped: true,
    }
  }

  // 2. Detect editors
  const detected = await detectAvailableEditors()
  const detectedEditors = detected.map((e) => e.name)

  if (detected.length === 0) {
    options.output.warn(NO_EDITORS_DETECTED_MESSAGE)
    return {
      configuredEditors: [],
      detectedEditors,
      skipped: true,
    }
  }

  // 3. Check for existing config BEFORE prompting
  const editorsWithExisting = await getEditorsWithExistingConfig(detected)

  // 4. Prompt user (shows existing config status, only pre-selects unconfigured editors)
  const selected = await promptForMCPSetup(detected, editorsWithExisting)

  if (!selected || selected.length === 0) {
    // User deselected all editors
    return {
      configuredEditors: [],
      detectedEditors,
      skipped: true,
    }
  }

  // 5. Create child token for MCP
  let token: string
  try {
    token = await createMCPToken()
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    options.output.warn(`Could not configure MCP: ${err.message}`)
    options.output.warn('You can set up MCP manually later using https://mcp.sanity.io')
    return {
      configuredEditors: [],
      detectedEditors,
      error: err,
      skipped: false,
    }
  }

  // 6. Write configs for each selected editor
  try {
    for (const editor of selected) {
      await writeMCPConfig(editor, token)
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    options.output.warn(`Could not configure MCP: ${err.message}`)
    options.output.warn('You can set up MCP manually later using https://mcp.sanity.io')
    return {
      configuredEditors: [],
      detectedEditors,
      error: err,
      skipped: false,
    }
  }

  const configuredEditors = selected.map((e) => e.name)
  options.output.log(`${logSymbols.success} MCP configured for ${configuredEditors.join(', ')}`)

  return {
    configuredEditors,
    detectedEditors,
    skipped: false,
  }
}

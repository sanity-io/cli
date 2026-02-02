import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'

import {createMCPToken, MCP_SERVER_URL} from '../../services/mcp.js'
import {detectAvailableEditors} from './detectAvailableEditors.js'
import {type EditorName} from './editorConfigs.js'
import {promptForMCPSetup} from './promptForMCPSetup.js'
import {writeMCPConfig} from './writeMCPConfig.js'

const mcpDebug = subdebug('mcp:setup')

const NO_EDITORS_DETECTED_MESSAGE = `Couldn't auto-configure Sanity MCP server for your editor. Visit ${MCP_SERVER_URL} for setup instructions.`

export interface MCPSetupResult {
  configuredEditors: EditorName[]
  detectedEditors: EditorName[]
  skipped: boolean

  error?: Error
}

/**
 * Main MCP setup orchestration
 * Opt-out by default: runs automatically unless skipMcp flag is set
 */
export async function setupMCP(mcp?: boolean): Promise<MCPSetupResult> {
  // 1. Check for explicit opt-out
  if (mcp === false) {
    ux.warn('Skipping MCP configuration due to --no-mcp flag')
    return {
      configuredEditors: [],
      detectedEditors: [],
      skipped: true,
    }
  }

  // 2. Detect available editors (filters out unparseable configs)
  const editors = await detectAvailableEditors()
  const detectedEditors = editors.map((e) => e.name)

  mcpDebug('Detected %d editors: %s', detectedEditors.length, detectedEditors)

  if (editors.length === 0) {
    ux.warn(NO_EDITORS_DETECTED_MESSAGE)
    return {
      configuredEditors: [],
      detectedEditors,
      skipped: true,
    }
  }

  // 3. Prompt user (shows existing config status, only pre-selects unconfigured editors)
  const selected = await promptForMCPSetup(editors)

  if (!selected || selected.length === 0) {
    // User deselected all editors
    ux.stdout('MCP configuration skipped')
    return {
      configuredEditors: [],
      detectedEditors,
      skipped: true,
    }
  }

  // 4. Create child token for MCP
  let token: string
  try {
    token = await createMCPToken()
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    mcpDebug('Error creating MCP token', error)
    ux.warn(`Could not configure MCP: ${err.message}`)
    ux.warn('You can set up MCP manually later using https://mcp.sanity.io')
    return {
      configuredEditors: [],
      detectedEditors,
      error: err,
      skipped: false,
    }
  }

  // 5. Write configs for each selected editor
  try {
    for (const editor of selected) {
      await writeMCPConfig(editor, token)
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    mcpDebug('Error writing MCP config', error)
    ux.warn(`Could not configure MCP: ${err.message}`)
    ux.warn('You can set up MCP manually later using https://mcp.sanity.io')
    return {
      configuredEditors: [],
      detectedEditors,
      error: err,
      skipped: false,
    }
  }

  const configuredEditors = selected.map((e) => e.name)
  ux.stdout(`${logSymbols.success} MCP configured for ${configuredEditors.join(', ')}`)

  return {
    configuredEditors,
    detectedEditors,
    skipped: false,
  }
}

import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {checkbox, logSymbols} from '@sanity/cli-core/ux'

import {createMCPToken, MCP_SERVER_URL} from '../../services/mcp.js'
import {detectAvailableEditors} from './detectAvailableEditors.js'
import {type EditorName} from './editorConfigs.js'
import {type Editor} from './types.js'
import {writeMCPConfig} from './writeMCPConfig.js'

const mcpDebug = subdebug('mcp:setup')

export const NO_EDITORS_DETECTED_MESSAGE = `Couldn't auto-configure Sanity MCP server for your editor. Visit ${MCP_SERVER_URL} for setup instructions.`

export interface MCPSetupResult {
  configuredEditors: EditorName[]
  detectedEditors: EditorName[]
  skipped: boolean

  error?: Error
}

/**
 * Prompt user to select which editors to configure
 * Shows existing config status - unconfigured editors are pre-selected,
 * configured editors show "(already installed)" and are not pre-selected
 */
async function promptForMCPSetup(editors: Editor[]): Promise<Editor[] | null> {
  const editorChoices = editors.map((e) => ({
    checked: !e.configured, // Only pre-select if NOT already configured
    name: e.configured ? `${e.name} (already installed)` : e.name,
    value: e.name,
  }))

  const result = await checkbox({
    choices: editorChoices,
    message: 'Configure Sanity MCP server?',
  })

  const selectedNames = result

  // User can deselect all to skip
  if (!selectedNames || selectedNames.length === 0) {
    return null
  }

  return editors.filter((e) => selectedNames.includes(e.name))
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

import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'

import {createMCPToken, MCP_SERVER_URL} from '../../services/mcp.js'
import {detectAvailableEditors} from './detectAvailableEditors.js'
import {type EditorName} from './editorConfigs.js'
import {promptForMCPSetup} from './promptForMCPSetup.js'
import {validateEditorTokens} from './validateEditorTokens.js'
import {writeMCPConfig} from './writeMCPConfig.js'

const mcpDebug = subdebug('mcp:setup')

const NO_EDITORS_DETECTED_MESSAGE = `Couldn't auto-configure Sanity MCP server for your editor. Visit ${MCP_SERVER_URL} for setup instructions.`

interface MCPSetupOptions {
  /**
   * Whether the user explicitly requested MCP configuration (e.g. `sanity mcp configure`).
   * When true, shows status messages even when there's nothing to do.
   * When false/undefined (e.g. called from `sanity init`), stays quiet.
   */
  explicit?: boolean

  /**
   * If true, skip MCP configuration entirely (e.g. --no-mcp flag).
   */
  skip?: boolean
}

interface MCPSetupResult {
  /** Editors that were already configured with valid credentials (nothing to do) */
  alreadyConfiguredEditors: EditorName[]
  configuredEditors: EditorName[]
  detectedEditors: EditorName[]
  skipped: boolean

  error?: Error
}

/**
 * Main MCP setup orchestration
 * Opt-out by default: runs automatically unless skip option is set
 */
export async function setupMCP(options?: MCPSetupOptions): Promise<MCPSetupResult> {
  const {explicit = false, skip = false} = options ?? {}

  // 1. Check for explicit opt-out
  if (skip) {
    ux.warn('Skipping MCP configuration due to --no-mcp flag')
    return {
      alreadyConfiguredEditors: [],
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
    if (explicit) {
      ux.warn(NO_EDITORS_DETECTED_MESSAGE)
    }
    return {
      alreadyConfiguredEditors: [],
      configuredEditors: [],
      detectedEditors,
      skipped: true,
    }
  }

  // 3. Validate existing tokens against the Sanity API
  await validateEditorTokens(editors)

  // 4. Check if there's anything actionable
  const actionable = editors.filter((e) => !e.configured || e.authStatus !== 'valid')

  if (actionable.length === 0) {
    mcpDebug('All editors configured with valid credentials')
    const alreadyConfiguredEditors = editors
      .filter((e) => e.configured && e.authStatus === 'valid')
      .map((e) => e.name)
    if (explicit) {
      ux.stdout(`${logSymbols.success} All detected editors are already configured`)
    }
    return {
      alreadyConfiguredEditors,
      configuredEditors: [],
      detectedEditors,
      skipped: true,
    }
  }

  // 5. Prompt user (shows only actionable editors, annotates auth issues)
  const selected = await promptForMCPSetup(actionable)

  if (!selected || selected.length === 0) {
    // User deselected all editors
    ux.stdout('MCP configuration skipped')
    return {
      alreadyConfiguredEditors: [],
      configuredEditors: [],
      detectedEditors,
      skipped: true,
    }
  }

  // 6. Get a token — reuse a valid existing one or create a new one
  let token: string | undefined

  // Look for an existing valid token we can reuse
  const validEditor = editors.find((e) => e.authStatus === 'valid' && e.existingToken)
  if (validEditor?.existingToken) {
    mcpDebug('Reusing valid token from %s', validEditor.name)
    token = validEditor.existingToken
  }

  // Fall back to creating a new token
  if (!token) {
    try {
      token = await createMCPToken()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      mcpDebug('Error creating MCP token', error)
      ux.warn(`Could not configure MCP: ${err.message}`)
      ux.warn('You can set up MCP manually later using https://mcp.sanity.io')
      return {
        alreadyConfiguredEditors: [],
        configuredEditors: [],
        detectedEditors,
        error: err,
        skipped: false,
      }
    }
  }

  // 7. Write configs for each selected editor
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
      alreadyConfiguredEditors: [],
      configuredEditors: [],
      detectedEditors,
      error: err,
      skipped: false,
    }
  }

  const configuredEditors = selected.map((e) => e.name)
  ux.stdout(`${logSymbols.success} MCP configured for ${configuredEditors.join(', ')}`)

  return {
    alreadyConfiguredEditors: [],
    configuredEditors,
    detectedEditors,
    skipped: false,
  }
}

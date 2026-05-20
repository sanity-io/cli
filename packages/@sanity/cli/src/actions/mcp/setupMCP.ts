import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'

import {createMCPToken, MCP_SERVER_URL} from '../../services/mcp.js'
import {toError} from '../../util/getErrorMessage.js'
import {detectAvailableEditors} from './detectAvailableEditors.js'
import {EDITOR_CONFIGS, type EditorName} from './editorConfigs.js'
import {promptForMCPSetup} from './promptForMCPSetup.js'
import {removeMCPConfig} from './removeMCPConfig.js'
import {type Editor} from './types.js'
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
   * Controls how MCP setup behaves:
   * - 'prompt': Ask the user where MCP should be configured (default)
   * - 'auto': Auto-configure all detected editors without prompting
   * - 'skip': Skip MCP configuration entirely
   */
  mode?: 'auto' | 'prompt' | 'skip'
}

interface MCPSetupResult {
  configuredEditors: EditorName[]
  detectedEditors: EditorName[]
  skipped: boolean

  error?: Error

  removedEditors?: EditorName[]
}

async function getTokenForConfiguration(editorsToConfigure: Editor[]): Promise<string | undefined> {
  const validEditor = editorsToConfigure.find((e) => e.authStatus === 'valid' && e.existingToken)
  if (validEditor?.existingToken) {
    mcpDebug('Reusing valid token from %s', validEditor.name)
    return validEditor.existingToken
  }

  const allOAuth = editorsToConfigure.every((e) => EDITOR_CONFIGS[e.name].oauthOnly)
  if (editorsToConfigure.length === 0 || allOAuth) {
    return undefined
  }

  return createMCPToken()
}

async function writeMCPConfigs(editors: Editor[], token?: string): Promise<EditorName[]> {
  const configuredEditors: EditorName[] = []
  for (const editor of editors) {
    await writeMCPConfig(editor, token)
    configuredEditors.push(editor.name)
  }
  return configuredEditors
}

async function removeMCPConfigs(editors: Editor[]): Promise<EditorName[]> {
  const removedEditors: EditorName[] = []
  for (const editor of editors) {
    await removeMCPConfig(editor)
    removedEditors.push(editor.name)
  }
  return removedEditors
}

/**
 * Main MCP setup orchestration
 * Opt-out by default: runs automatically unless skip option is set
 */
export async function setupMCP(options?: MCPSetupOptions): Promise<MCPSetupResult> {
  const {explicit = false, mode = 'prompt'} = options ?? {}

  // 1. Check for explicit opt-out
  if (mode === 'skip') {
    mcpDebug('Skipping MCP configuration (mode: skip)')
    return {
      configuredEditors: [],
      detectedEditors: [],
      removedEditors: [],
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
      configuredEditors: [],
      detectedEditors,
      removedEditors: [],
      skipped: true,
    }
  }

  // 3. Validate existing tokens against the Sanity API
  await validateEditorTokens(editors)

  // 4. Select the desired final state.
  // Auto mode has no toggles, so every detected editor is selected and rewritten.
  const selected = mode === 'auto' ? editors : await promptForMCPSetup(editors)
  const selectedNames = new Set(selected.map((e) => e.name))
  const editorsToConfigure = selected
  const editorsToRemove =
    mode === 'auto' ? [] : editors.filter((e) => e.configured && !selectedNames.has(e.name))

  if (editorsToConfigure.length === 0 && editorsToRemove.length === 0) {
    ux.stdout('MCP configuration skipped')
    return {
      configuredEditors: [],
      detectedEditors,
      removedEditors: [],
      skipped: true,
    }
  }

  let token: string | undefined
  try {
    token = await getTokenForConfiguration(editorsToConfigure)
  } catch (error) {
    const err = toError(error)
    mcpDebug('Error creating MCP token', error)
    ux.warn(`Could not configure MCP: ${err.message}`)
    ux.warn('You can set up MCP manually later using https://mcp.sanity.io')
    return {
      configuredEditors: [],
      detectedEditors,
      error: err,
      removedEditors: [],
      skipped: false,
    }
  }

  let configuredEditors: EditorName[] = []
  try {
    configuredEditors = await writeMCPConfigs(editorsToConfigure, token)
  } catch (error) {
    const err = toError(error)
    mcpDebug('Error writing MCP config', error)
    ux.warn(`Could not configure MCP: ${err.message}`)
    ux.warn('You can set up MCP manually later using https://mcp.sanity.io')
    return {
      configuredEditors,
      detectedEditors,
      error: err,
      removedEditors: [],
      skipped: false,
    }
  }

  let removedEditors: EditorName[] = []
  try {
    removedEditors = await removeMCPConfigs(editorsToRemove)
  } catch (error) {
    const err = toError(error)
    mcpDebug('Error removing MCP config', error)
    ux.warn(`Could not remove MCP configuration: ${err.message}`)
    ux.warn('You can update MCP manually later using https://mcp.sanity.io')
    return {
      configuredEditors,
      detectedEditors,
      error: err,
      removedEditors,
      skipped: false,
    }
  }

  if (configuredEditors.length > 0) {
    ux.stdout(`${logSymbols.success} MCP configured for ${configuredEditors.join(', ')}`)
  }

  if (removedEditors.length > 0) {
    ux.stdout(`${logSymbols.success} MCP removed from ${removedEditors.join(', ')}`)
  }

  return {
    configuredEditors,
    detectedEditors,
    removedEditors,
    skipped: false,
  }
}

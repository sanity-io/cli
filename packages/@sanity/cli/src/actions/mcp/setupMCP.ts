import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'

import {createMCPToken, MCP_SERVER_URL} from '../../services/mcp.js'
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
  /** Editors that were already configured with valid credentials (nothing to do) */
  alreadyConfiguredEditors: EditorName[]
  configuredEditors: EditorName[]
  detectedEditors: EditorName[]
  skipped: boolean

  error?: Error

  removedEditors?: EditorName[]
}

function hasValidConfig(editor: Editor): boolean {
  return editor.configured && editor.authStatus === 'valid'
}

function needsConfiguration(editor: Editor): boolean {
  return !hasValidConfig(editor)
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

async function getTokenForConfiguration(
  editors: Editor[],
  editorsToConfigure: Editor[],
): Promise<string | undefined> {
  const validEditor = editors.find((e) => e.authStatus === 'valid' && e.existingToken)
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
      alreadyConfiguredEditors: [],
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
      alreadyConfiguredEditors: [],
      configuredEditors: [],
      detectedEditors,
      removedEditors: [],
      skipped: true,
    }
  }

  // 3. Validate existing tokens against the Sanity API
  await validateEditorTokens(editors)

  // 4. Check if there's anything actionable
  const actionable = editors.filter((editor) => needsConfiguration(editor))

  if (mode === 'auto' && actionable.length === 0) {
    mcpDebug('All editors configured with valid credentials')
    const alreadyConfiguredEditors = editors
      .filter((editor) => hasValidConfig(editor))
      .map((e) => e.name)
    if (explicit) {
      ux.stdout(`${logSymbols.success} All detected editors are already configured`)
    }
    return {
      alreadyConfiguredEditors,
      configuredEditors: [],
      detectedEditors,
      removedEditors: [],
      skipped: true,
    }
  }

  // 5. Select the desired final state — prompt interactively or auto-select actionable editors
  const selected = mode === 'auto' ? actionable : await promptForMCPSetup(editors)
  const selectedNames = new Set(selected.map((e) => e.name))
  const configuredNames = new Set(editors.filter((e) => e.configured).map((e) => e.name))
  const alreadyConfiguredEditors = editors
    .filter((e) => hasValidConfig(e) && (mode === 'auto' || selectedNames.has(e.name)))
    .map((e) => e.name)
  const editorsToConfigure = selected.filter((editor) => needsConfiguration(editor))
  const editorsToRemove =
    mode === 'auto' ? [] : editors.filter((e) => e.configured && !selectedNames.has(e.name))

  if (editorsToConfigure.length === 0 && editorsToRemove.length === 0) {
    if (selected.length === 0 && configuredNames.size === 0) {
      ux.stdout('MCP configuration skipped')
    } else if (explicit) {
      ux.stdout(`${logSymbols.success} Sanity MCP configuration unchanged`)
    }
    return {
      alreadyConfiguredEditors,
      configuredEditors: [],
      detectedEditors,
      removedEditors: [],
      skipped: true,
    }
  }

  let token: string | undefined
  try {
    token = await getTokenForConfiguration(editors, editorsToConfigure)
  } catch (error) {
    const err = toError(error)
    mcpDebug('Error creating MCP token', error)
    ux.warn(`Could not configure MCP: ${err.message}`)
    ux.warn('You can set up MCP manually later using https://mcp.sanity.io')
    return {
      alreadyConfiguredEditors,
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
      alreadyConfiguredEditors,
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
      alreadyConfiguredEditors,
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
    alreadyConfiguredEditors,
    configuredEditors,
    detectedEditors,
    removedEditors,
    skipped: false,
  }
}

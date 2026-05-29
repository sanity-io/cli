import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'

import {createMCPToken, MCP_SERVER_URL} from '../../services/mcp.js'
import {toError} from '../../util/getErrorMessage.js'
import {detectAvailableEditors} from './detectAvailableEditors.js'
import {EDITOR_CONFIGS, type EditorName} from './editorConfigs.js'
import {promptForMCPSetup} from './promptForMCPSetup.js'
import {removeMCPConfig} from './removeMCPConfig.js'
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
   * - 'prompt': Ask the user which editors to configure (default)
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
  removedEditors: EditorName[]
  skipped: boolean

  error?: Error
}

/**
 * Main MCP setup orchestration
 * Opt-out by default: runs automatically unless skip option is set
 */
export async function setupMCP(options?: MCPSetupOptions): Promise<MCPSetupResult> {
  const {explicit = false, mode = 'prompt'} = options ?? {}

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

  const editors = await detectAvailableEditors()
  const detectedEditors = editors.map((e) => e.name)

  mcpDebug('Detected %d editors: %s', detectedEditors.length, detectedEditors)

  if (editors.length === 0) {
    if (explicit) ux.warn(NO_EDITORS_DETECTED_MESSAGE)
    return {
      alreadyConfiguredEditors: [],
      configuredEditors: [],
      detectedEditors,
      removedEditors: [],
      skipped: true,
    }
  }

  await validateEditorTokens(editors)

  // The prompt shows every detected editor; what the user keeps checked is the
  // desired final state. In auto mode, treat every editor as selected.
  const selected = mode === 'auto' ? editors : await promptForMCPSetup(editors)
  const selectedNames = new Set(selected.map((e) => e.name))

  const editorsToRemove = editors.filter((e) => e.configured && !selectedNames.has(e.name))

  if (selected.length === 0 && editorsToRemove.length === 0) {
    if (explicit) ux.stdout('MCP configuration skipped')
    return {
      alreadyConfiguredEditors: [],
      configuredEditors: [],
      detectedEditors,
      removedEditors: [],
      skipped: true,
    }
  }

  let token: string | undefined
  let firstError: Error | undefined

  const reusable = editors.find((e) => e.authStatus === 'valid' && e.existingToken)
  if (reusable?.existingToken) {
    mcpDebug('Reusing valid token from %s', reusable.name)
    token = reusable.existingToken
  }
  const needsToken = selected.some((e) => !EDITOR_CONFIGS[e.name].oauthOnly)
  if (!token && needsToken) {
    try {
      token = await createMCPToken()
    } catch (error) {
      const err = toError(error)
      mcpDebug('Error creating MCP token', error)
      ux.warn(`Could not configure MCP: ${err.message}`)
      ux.warn('You can set up MCP manually later using https://mcp.sanity.io')
      return {
        alreadyConfiguredEditors: [],
        configuredEditors: [],
        detectedEditors,
        error: err,
        removedEditors: [],
        skipped: false,
      }
    }
  }

  const configuredEditors: EditorName[] = []
  const alreadyConfiguredEditors: EditorName[] = []
  for (const editor of selected) {
    try {
      const wrote = await writeMCPConfig(editor, token)
      if (wrote) configuredEditors.push(editor.name)
      else alreadyConfiguredEditors.push(editor.name)
    } catch (error) {
      const err = toError(error)
      mcpDebug('Error writing MCP config for %s: %s', editor.name, err)
      ux.warn(`Could not configure MCP for ${editor.name}: ${err.message}`)
      firstError ??= err
    }
  }

  const removedEditors: EditorName[] = []
  for (const editor of editorsToRemove) {
    try {
      await removeMCPConfig(editor)
      removedEditors.push(editor.name)
    } catch (error) {
      const err = toError(error)
      mcpDebug('Error removing MCP config for %s: %s', editor.name, err)
      ux.warn(`Could not remove MCP configuration for ${editor.name}: ${err.message}`)
      firstError ??= err
    }
  }

  if (configuredEditors.length > 0) {
    ux.stdout(`${logSymbols.success} MCP configured for ${configuredEditors.join(', ')}`)
  }
  if (removedEditors.length > 0) {
    ux.stdout(`${logSymbols.success} MCP removed from ${removedEditors.join(', ')}`)
  }
  if (firstError) {
    ux.warn('Some editors could not be updated. See https://mcp.sanity.io for manual setup.')
  } else if (
    explicit &&
    configuredEditors.length === 0 &&
    removedEditors.length === 0 &&
    alreadyConfiguredEditors.length > 0
  ) {
    ux.stdout(`${logSymbols.success} All detected editors are already configured`)
  }

  return {
    alreadyConfiguredEditors,
    configuredEditors,
    detectedEditors,
    error: firstError,
    removedEditors,
    skipped: false,
  }
}

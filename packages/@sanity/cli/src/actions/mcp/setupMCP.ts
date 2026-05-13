import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'

import {createMCPToken, MCP_SERVER_URL} from '../../services/mcp.js'
import {setupSkills} from '../skills/setupSkills.js'
import {detectAvailableEditors} from './detectAvailableEditors.js'
import {EDITOR_CONFIGS, type EditorName, getSkillsCliAgent} from './editorConfigs.js'
import {promptForMCPSetup} from './promptForMCPSetup.js'
import {validateEditorTokens} from './validateEditorTokens.js'
import {writeMCPConfig} from './writeMCPConfig.js'

const mcpDebug = subdebug('mcp:setup')

const NO_EDITORS_DETECTED_MESSAGE = `Couldn't auto-configure Sanity MCP server for your editor. Visit ${MCP_SERVER_URL} for setup instructions.`

interface MCPSetupOptions {
  /**
   * Working directory to install agent skills into. When provided, agent skills
   * are installed into this directory after MCP is configured. When omitted
   * (e.g. `sanity mcp configure`), skills installation is skipped — we don't
   * want to write skill files into an arbitrary cwd like `~/dev`.
   */
  cwd?: string

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
  /** Skills CLI `--agent` values that received `sanity-io/agent-toolkit` */
  installedSkillsCliAgents: string[]
  skipped: boolean

  error?: Error
  /** Set when skills install failed; MCP setup itself may still have succeeded. */
  skillsError?: Error
}

/**
 * Main MCP setup orchestration
 * Opt-out by default: runs automatically unless skip option is set
 */
export async function setupMCP(options?: MCPSetupOptions): Promise<MCPSetupResult> {
  const {cwd, explicit = false, mode = 'prompt'} = options ?? {}

  // 1. Check for explicit opt-out
  if (mode === 'skip') {
    mcpDebug('Skipping MCP configuration (mode: skip)')
    return {
      alreadyConfiguredEditors: [],
      configuredEditors: [],
      detectedEditors: [],
      installedSkillsCliAgents: [],
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
      installedSkillsCliAgents: [],
      skipped: true,
    }
  }

  // 3. Validate existing tokens against the Sanity API
  await validateEditorTokens(editors)

  // 4. Check if there's anything actionable
  // An editor needs MCP setup if it's not configured yet or its credentials
  // aren't valid. When a `cwd` is set (sanity init), every detected editor
  // also needs skills installed into the new project — MCP being already
  // configured globally doesn't imply project-local skills exist.
  const needsMCPSetup = (e: (typeof editors)[number]) => !e.configured || e.authStatus !== 'valid'
  const needsSkillsSetup = (e: (typeof editors)[number]) =>
    Boolean(cwd && e.configured && e.authStatus === 'valid' && getSkillsCliAgent(e.name))
  const actionable = editors.filter((e) => needsMCPSetup(e) || needsSkillsSetup(e))

  if (actionable.length === 0) {
    mcpDebug('All editors configured with valid credentials and no skills setup needed')
    const alreadyConfiguredEditorObjects = editors.filter(
      (e) => e.configured && e.authStatus === 'valid',
    )
    const alreadyConfiguredEditors = alreadyConfiguredEditorObjects.map((e) => e.name)
    if (explicit) {
      ux.stdout(`${logSymbols.success} All detected editors are already configured`)
    }

    return {
      alreadyConfiguredEditors,
      configuredEditors: [],
      detectedEditors,
      installedSkillsCliAgents: [],
      skipped: true,
    }
  }

  // Non-actionable editors are already configured with valid credentials and
  // don't need skills setup either.
  const alreadyConfiguredEditors = editors.filter((e) => !actionable.includes(e)).map((e) => e.name)

  // 5. Select editors to configure — prompt interactively or auto-select all
  const selected = mode === 'auto' ? actionable : await promptForMCPSetup(actionable)

  if (!selected || selected.length === 0) {
    // User deselected all editors
    ux.stdout('MCP configuration skipped')
    return {
      alreadyConfiguredEditors,
      configuredEditors: [],
      detectedEditors,
      installedSkillsCliAgents: [],
      skipped: true,
    }
  }

  // Of the selected editors, only some need MCP config written. Others are
  // already configured globally and only need project-local skills installed.
  const selectedForMCP = selected.filter((e) => needsMCPSetup(e))

  // 6. Get a token — reuse a valid existing one or create a new one
  let token: string | undefined

  // Look for an existing valid token we can reuse
  const validEditor = editors.find((e) => e.authStatus === 'valid' && e.existingToken)
  if (validEditor?.existingToken) {
    mcpDebug('Reusing valid token from %s', validEditor.name)
    token = validEditor.existingToken
  }

  const allOAuth =
    selectedForMCP.length > 0 && selectedForMCP.every((e) => EDITOR_CONFIGS[e.name].oauthOnly)

  // Fall back to creating a new token. Skip when no editors need MCP set up
  // or when all of them use OAuth (no token required).
  if (!token && !allOAuth && selectedForMCP.length > 0) {
    try {
      token = await createMCPToken()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      mcpDebug('Error creating MCP token', error)
      ux.warn(`Could not configure MCP: ${err.message}`)
      ux.warn('You can set up MCP manually later using https://mcp.sanity.io')
      return {
        alreadyConfiguredEditors,
        configuredEditors: [],
        detectedEditors,
        error: err,
        installedSkillsCliAgents: [],
        skipped: false,
      }
    }
  }

  // 7. Write configs for editors that actually need MCP setup
  const configuredEditors: EditorName[] = []
  try {
    for (const editor of selectedForMCP) {
      await writeMCPConfig(editor, token)
      configuredEditors.push(editor.name)
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    mcpDebug('Error writing MCP config', error)
    ux.warn(`Could not configure MCP: ${err.message}`)
    ux.warn('You can set up MCP manually later using https://mcp.sanity.io')
    return {
      alreadyConfiguredEditors,
      configuredEditors,
      detectedEditors,
      error: err,
      installedSkillsCliAgents: [],
      skipped: false,
    }
  }

  if (configuredEditors.length > 0) {
    ux.stdout(`${logSymbols.success} MCP configured for ${configuredEditors.join(', ')}`)
  }

  // 8. Install Sanity agent skills for every selected editor (best-effort).
  // This includes editors whose MCP was already configured — they may still
  // be missing project-local skills.
  const skillsResult = cwd ? await setupSkills({cwd, editors: selected}) : undefined

  return {
    alreadyConfiguredEditors,
    configuredEditors,
    detectedEditors,
    installedSkillsCliAgents: skillsResult?.installedAgents ?? [],
    skillsError: skillsResult?.error,
    skipped: false,
  }
}

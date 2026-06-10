import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'

import {createMCPToken, MCP_SERVER_URL} from '../../services/mcp.js'
import {readSkillState} from '../skills/readSkillState.js'
import {SANITY_SKILL_NAMES} from '../skills/setupSkills.js'
import {detectAvailableEditors} from './detectAvailableEditors.js'
import {
  EDITOR_CONFIGS,
  type EditorName,
  getSkillsCliAgent,
  getSkillsCliAgentDisplayName,
} from './editorConfigs.js'
import {type EditorAction, type EditorChoice, promptForMCPSetup} from './promptForMCPSetup.js'
import {type Editor} from './types.js'
import {validateEditorTokens} from './validateEditorTokens.js'
import {writeMCPConfig} from './writeMCPConfig.js'

const mcpDebug = subdebug('mcp:setup')

const NO_EDITORS_DETECTED_MESSAGE = `Couldn't auto-configure Sanity MCP server for your editor. Visit ${MCP_SERVER_URL} for setup instructions.`

type Mode = 'auto' | 'prompt' | 'skip'

interface MCPSetupOptions {
  /**
   * Pre-detected editors. When omitted, `detectAvailableEditors()` is called.
   * Accepting this from the caller avoids re-running detection (which probes
   * the filesystem and shells out to CLI binaries) when the result is already
   * available — e.g. when `sanity init` runs both MCP and skills setup.
   */
  editors?: Editor[]

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
  mode?: Mode

  /**
   * Controls whether skills install is also offered in the same prompt:
   * - 'prompt': Combine MCP + skills offers in one checkbox
   * - 'auto': Combine, but skip the prompt and select everything
   * - 'skip' (default): Skip skills entirely — today's MCP-only behavior
   */
  skillsMode?: Mode
}

interface MCPSetupResult {
  /** Editors that were already configured with valid credentials (nothing to do) */
  alreadyConfiguredEditors: EditorName[]
  configuredEditors: EditorName[]
  detectedEditors: EditorName[]
  /** Skills-CLI agent IDs that the caller should install. Deduplicated. */
  skillsToInstall: string[]
  skipped: boolean

  error?: Error
}

interface ClassifiedEditor {
  action: 'none' | EditorAction
  editor: Editor
}

/**
 * Classify each editor into one of four actions based on MCP status and
 * whether the Sanity skills are already installed for its skills-CLI agent.
 */
function classifyEditors(editors: Editor[]): ClassifiedEditor[] {
  return editors.map((editor) => {
    const needsMCP = !editor.configured || editor.authStatus !== 'valid'
    const skillsCliAgent = getSkillsCliAgent(editor.name)
    const hasSkillMapping = Boolean(skillsCliAgent)
    const skillInstalled = editor.skillInstalled === true

    if (needsMCP) {
      return {action: hasSkillMapping ? 'mcp-and-skill' : 'mcp-only', editor}
    }
    if (hasSkillMapping && !skillInstalled) {
      return {action: 'skill-only', editor}
    }
    return {action: 'none', editor}
  })
}

/**
 * Apply masking based on the configured modes. `skip` modes mute the
 * corresponding action so we never prompt for or run work the user opted out
 * of via `--no-mcp` / `--no-skills`.
 */
function applyMasking(
  classified: ClassifiedEditor[],
  mcpMode: Mode,
  skillsMode: Mode,
): EditorChoice[] {
  const actionable: EditorChoice[] = []

  for (const {action, editor} of classified) {
    if (action === 'none') continue

    if (mcpMode === 'skip' && skillsMode === 'skip') continue

    if (mcpMode === 'skip') {
      // No MCP writes — keep only skill-only / mcp-and-skill (downgraded to skill-only)
      if (action === 'mcp-only') continue
      if (action === 'mcp-and-skill') {
        actionable.push({action: 'skill-only', editor})
        continue
      }
      actionable.push({action, editor})
      continue
    }

    if (skillsMode === 'skip') {
      // No skill install — drop skill-only, downgrade mcp-and-skill → mcp-only
      if (action === 'skill-only') continue
      if (action === 'mcp-and-skill') {
        actionable.push({action: 'mcp-only', editor})
        continue
      }
      actionable.push({action, editor})
      continue
    }

    actionable.push({action, editor})
  }

  return actionable
}

function getPromptMessage(mcpMode: Mode, skillsMode: Mode): string {
  if (mcpMode === 'skip') return 'Install Sanity agent skills for these editors?'
  if (skillsMode === 'skip') return 'Configure Sanity MCP server?'
  return 'Configure Sanity MCP and agent skills for these editors?'
}

/**
 * Main MCP setup orchestration.
 *
 * When `skillsMode !== 'skip'`, the prompt combines MCP and skills offers,
 * and the result includes `skillsToInstall` — agent IDs the caller should
 * install via `setupSkills`. `setupMCP` itself never installs skills.
 */
export async function setupMCP(options?: MCPSetupOptions): Promise<MCPSetupResult> {
  const {explicit = false, mode: mcpMode = 'prompt', skillsMode = 'skip'} = options ?? {}

  // 1. Both opted out → nothing to do.
  if (mcpMode === 'skip' && skillsMode === 'skip') {
    mcpDebug('Skipping setup (mcpMode: skip, skillsMode: skip)')
    return {
      alreadyConfiguredEditors: [],
      configuredEditors: [],
      detectedEditors: [],
      skillsToInstall: [],
      skipped: true,
    }
  }

  // 2. Detect available editors (filters out unparseable configs)
  const editors = options?.editors ?? (await detectAvailableEditors())
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
      skillsToInstall: [],
      skipped: true,
    }
  }

  // 3. Validate existing tokens against the Sanity API
  await validateEditorTokens(editors)

  // 4. Read skill state when skills are in scope so classification can dedup
  if (skillsMode !== 'skip') {
    const {installedAgentDisplayNames} = await readSkillState({skillNames: SANITY_SKILL_NAMES})
    for (const editor of editors) {
      const displayName = getSkillsCliAgentDisplayName(editor.name)
      editor.skillInstalled = displayName ? installedAgentDisplayNames.has(displayName) : false
    }
  }

  // 5. Classify + mask
  const classified = classifyEditors(editors)
  const actionable = applyMasking(classified, mcpMode, skillsMode)

  // "Already configured" surfaces editors whose MCP setup is valid (skill
  // state doesn't matter for this signal — that's what skillsToInstall is for).
  const actionableNames = new Set(actionable.map((c) => c.editor.name))
  const alreadyConfiguredEditors = editors
    .filter((e) => e.configured && e.authStatus === 'valid' && !actionableNames.has(e.name))
    .map((e) => e.name)

  if (actionable.length === 0) {
    mcpDebug('Nothing actionable after classification + masking')
    if (explicit) {
      ux.stdout(`${logSymbols.success} All detected editors are already configured`)
    }
    return {
      alreadyConfiguredEditors,
      configuredEditors: [],
      detectedEditors,
      skillsToInstall: [],
      skipped: true,
    }
  }

  // 6. Select editors to configure — prompt interactively or auto-select all.
  // We only auto when neither side wants a prompt: MCP auto, or (MCP skip
  // + skills auto). Anything that asks `mode: 'prompt'` for MCP wins the
  // prompt even when skills would have auto-installed.
  const shouldAuto = mcpMode === 'auto' || (mcpMode === 'skip' && skillsMode === 'auto')
  const selected = shouldAuto
    ? actionable
    : await promptForMCPSetup({
        choices: actionable,
        message: getPromptMessage(mcpMode, skillsMode),
      })

  if (!selected || selected.length === 0) {
    ux.stdout('MCP configuration skipped')
    return {
      alreadyConfiguredEditors,
      configuredEditors: [],
      detectedEditors,
      skillsToInstall: [],
      skipped: true,
    }
  }

  // 7. MCP write phase — only for choices that need MCP
  const mcpSelected = selected.filter(
    (c) => c.action === 'mcp-only' || c.action === 'mcp-and-skill',
  )

  let token: string | undefined
  const configuredEditors: EditorName[] = []
  let mcpError: Error | undefined

  if (mcpSelected.length > 0) {
    const validEditor = editors.find((e) => e.authStatus === 'valid' && e.existingToken)
    if (validEditor?.existingToken) {
      mcpDebug('Reusing valid token from %s', validEditor.name)
      token = validEditor.existingToken
    }

    const allOAuth = mcpSelected.every((c) => EDITOR_CONFIGS[c.editor.name].oauthOnly)

    if (!token && !allOAuth) {
      try {
        token = await createMCPToken()
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        mcpDebug('Error creating MCP token', error)
        ux.warn(`Could not configure MCP: ${err.message}`)
        ux.warn('You can set up MCP manually later using https://mcp.sanity.io')
        mcpError = err
      }
    }

    if (!mcpError) {
      for (const choice of mcpSelected) {
        try {
          await writeMCPConfig(choice.editor, token)
          configuredEditors.push(choice.editor.name)
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))
          mcpDebug('Error writing MCP config for %s: %O', choice.editor.name, error)
          ux.warn(`Could not configure MCP for ${choice.editor.name}: ${err.message}`)
          ux.warn('You can set up MCP manually later using https://mcp.sanity.io')
          mcpError = err
        }
      }
    }

    if (configuredEditors.length > 0) {
      ux.stdout(`${logSymbols.success} MCP configured for ${configuredEditors.join(', ')}`)
    }
  }

  // 8. Build skillsToInstall — only for choices the user kept, only when the
  // associated MCP write succeeded (or wasn't needed).
  const skillsToInstall: string[] = []
  if (skillsMode !== 'skip') {
    for (const choice of selected) {
      if (choice.action === 'skill-only') {
        const agent = getSkillsCliAgent(choice.editor.name)
        if (agent) skillsToInstall.push(agent)
        continue
      }
      if (choice.action === 'mcp-and-skill' && configuredEditors.includes(choice.editor.name)) {
        const agent = getSkillsCliAgent(choice.editor.name)
        if (agent) skillsToInstall.push(agent)
      }
    }
  }

  return {
    alreadyConfiguredEditors,
    configuredEditors,
    detectedEditors,
    error: mcpError,
    skillsToInstall: [...new Set(skillsToInstall)],
    skipped: false,
  }
}

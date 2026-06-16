import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'

import {detectAvailableEditors} from '../mcp/detectAvailableEditors.js'
import {type EditorName, getSkillsCliAgent} from '../mcp/editorConfigs.js'
import {type Editor} from '../mcp/types.js'
import {setupSkills} from './setupSkills.js'

const debug = subdebug('skills:configure')

const NO_EDITORS_MESSAGE =
  'No supported editors detected for Sanity agent skills. See https://www.sanity.io/docs/ai/skills for manual setup.'

interface ConfigureSkillsOptions {
  /**
   * Pre-detected editors. When omitted, `detectAvailableEditors()` is called.
   * Accepting this avoids re-running detection when the caller already has it.
   */
  editors?: Editor[]
}

interface ConfigureSkillsResult {
  detectedEditors: EditorName[]
  /** Deduplicated skills-CLI agent IDs that were installed. */
  installedAgents: string[]
  skipped: boolean

  error?: Error
}

/**
 * Standalone, MCP-free orchestration for installing Sanity agent skills for
 * the user's detected AI editors. Forwards every detected agent with a
 * skills-CLI mapping to `setupSkills` without prompting.
 *
 * Re-running is intentional: `skills add ... -g -y` reinstalls (overwrites) the
 * skill files in place, so a subsequent `sanity skills install` updates
 * already-installed skills to the latest version. Failures are surfaced as
 * warnings and never thrown.
 */
export async function configureSkills(
  options?: ConfigureSkillsOptions,
): Promise<ConfigureSkillsResult> {
  const editors = options?.editors ?? (await detectAvailableEditors())
  const detectedEditors = editors.map((e) => e.name)
  debug('Detected %d editors: %s', detectedEditors.length, detectedEditors)

  const agents = [
    ...new Set(
      editors.flatMap((editor) => {
        const agent = getSkillsCliAgent(editor.name)
        return agent ? [agent] : []
      }),
    ),
  ]

  if (agents.length === 0) {
    ux.warn(NO_EDITORS_MESSAGE)
    return {detectedEditors, installedAgents: [], skipped: true}
  }

  const result = await setupSkills({agents})

  return {
    detectedEditors,
    error: result.error,
    installedAgents: result.installedAgents,
    skipped: result.skipped,
  }
}

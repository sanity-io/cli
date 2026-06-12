import {getSkillsCliAgent, getSkillsCliAgentDisplayName} from '../mcp/editorConfigs.js'
import {type Editor} from '../mcp/types.js'
import {readSkillState} from './readSkillState.js'
import {SANITY_SKILL_NAMES} from './setupSkills.js'

export interface SkillCandidate {
  /** skills-CLI agent id to pass to `skills add -a`. */
  agent: string
  editor: Editor
}

/**
 * Probe the global skill state and return the set of skills-CLI agent display
 * names that already have all Sanity skills installed.
 *
 * Best-effort: `readSkillState` swallows failures and returns an empty set, so
 * callers treat agents as "not installed" rather than skipping on a flaky probe.
 */
export async function getInstalledSkillAgentDisplayNames(): Promise<Set<string>> {
  const {installedAgentDisplayNames} = await readSkillState({skillNames: SANITY_SKILL_NAMES})
  return installedAgentDisplayNames
}

/**
 * Single source of truth for "which detected editors still want a skills
 * install". An editor is a candidate when it has a skills-CLI mapping AND the
 * Sanity skills are not already installed for its agent.
 *
 * Used by both the standalone `skills configure` flow (`configureSkills`) and
 * the combined `init` flow (`setupMCP`).
 */
export function getSkillCandidates(
  editors: Editor[],
  installedAgentDisplayNames: Set<string>,
): SkillCandidate[] {
  const candidates: SkillCandidate[] = []

  for (const editor of editors) {
    const agent = getSkillsCliAgent(editor.name)
    if (!agent) continue

    const displayName = getSkillsCliAgentDisplayName(editor.name)
    if (displayName && installedAgentDisplayNames.has(displayName)) continue

    candidates.push({agent, editor})
  }

  return candidates
}

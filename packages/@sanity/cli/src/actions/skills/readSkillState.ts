import {subdebug} from '@sanity/cli-core'
import {type InstalledSkillInfo} from 'skills'

import {
  getSkillsCliAgentDisplayName,
  getSkillsCliAgentDisplayNameById,
  isUniversalSkillsCliAgentByEditorName,
  UNIVERSAL_SKILLS_DIR,
} from '../mcp/editorConfigs.js'
import {type Editor} from '../mcp/types.js'

const debug = subdebug('skills:state')

interface ReadSkillStateOptions {
  /**
   * Detected editors. Used to credit "universal" agents (those that read from
   * the shared `.agents/skills` directory) when the skills live there — see
   * note in `readSkillState`.
   */
  editors: Editor[]
  /** Names of the skills to look up (match the `name` of `listSkills()` entries). */
  skillNames: string[]
}

interface SkillState {
  /** Display names of agents that have all of these skills installed globally. */
  installedAgentDisplayNames: Set<string>
}

/** Upper bound for reading the global skill state (checked between steps). */
const LIST_TIMEOUT_MS = 10_000

/** Normalizes path separators to `/` so comparisons are OS-agnostic. */
function toPosixPath(value: string): string {
  return value.replaceAll('\\', '/')
}

/**
 * A skill lives in the shared universal skills directory when its canonical
 * path is under `.agents/skills`. The `skills` CLI installs universal-agent
 * skills there directly (rather than under an agent-specific directory).
 */
function isUniversalSkillPath(skillPath: string): boolean {
  return toPosixPath(skillPath).includes(`${UNIVERSAL_SKILLS_DIR}/`)
}

/**
 * Lists global skills via the bundled `skills` package's `listSkills` and
 * returns the set of agent display names that have every skill in
 * `skillNames` installed globally.
 * Agents missing any of the skills are excluded, so they get a (idempotent)
 * re-install that fills the gap.
 *
 * "Universal" agents (those whose `skillsDir` is the shared `.agents/skills`
 * directory) are credited whenever every requested skill lives in that shared
 * directory. `listSkills` only attributes a skill to agents it independently
 * detects, so a universal editor we detected may be absent from the output even
 * though it reads from the shared directory and already has the skills.
 *
 * Any failure (import, read, timeout) is debug-logged and
 * resolved with an empty set. Callers should treat that as "treat all agents
 * as not installed" — re-installing is idempotent, so over-installing is
 * safer than skipping based on a flaky probe.
 */
export async function readSkillState(opts: ReadSkillStateOptions): Promise<SkillState> {
  const {editors, skillNames} = opts
  const empty: SkillState = {installedAgentDisplayNames: new Set()}

  let entries: readonly InstalledSkillInfo[]
  try {
    // Loaded lazily so a problem with the `skills` package only affects this
    // best-effort probe, not every command that imports this module.
    // eslint-disable-next-line no-restricted-syntax -- package import, not a file path
    const {listSkills} = await import('skills')
    const result = await listSkills({
      scope: 'global',
      signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
    })
    entries = result.skills
  } catch (error) {
    debug('skills list failed: %O', error)
    return empty
  }

  const agentSets = skillNames.map((skillName) => {
    const match = entries.find((entry) => entry.name === skillName)
    if (!match) {
      return new Set<string>()
    }
    // `listSkills` reports agent IDs; callers match on display names.
    return new Set(
      match.agents.map((agentId) => getSkillsCliAgentDisplayNameById(agentId) ?? agentId),
    )
  })

  const installed = new Set(
    [...(agentSets[0] ?? [])].filter((agent) => agentSets.every((set) => set.has(agent))),
  )

  // Universal agents share the `.agents/skills` directory. If every requested
  // skill lives there, credit each detected universal editor — otherwise a
  // detected universal editor that the `skills` CLI didn't independently detect
  // would be treated as missing and trigger a redundant re-install.
  const allSkillsInUniversalDir =
    skillNames.length > 0 &&
    skillNames.every((skillName) => {
      const match = entries.find((entry) => entry.name === skillName)
      return match ? isUniversalSkillPath(match.path) : false
    })

  if (allSkillsInUniversalDir) {
    for (const editor of editors) {
      if (!isUniversalSkillsCliAgentByEditorName(editor.name)) continue
      const displayName = getSkillsCliAgentDisplayName(editor.name)
      if (displayName) installed.add(displayName)
    }
  }

  return {installedAgentDisplayNames: installed}
}

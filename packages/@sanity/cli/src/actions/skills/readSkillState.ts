import {sep} from 'node:path'

import {subdebug} from '@sanity/cli-core'
import {execa} from 'execa'

import {
  getSkillsCliAgentDisplayName,
  isUniversalSkillsCliAgentByEditorName,
  UNIVERSAL_SKILLS_DIR,
} from '../mcp/editorConfigs.js'
import {type Editor} from '../mcp/types.js'
import {SKILLS_BIN_PATH} from './setupSkills.js'

const debug = subdebug('skills:state')

interface ReadSkillStateOptions {
  /**
   * Detected editors. Used to credit "universal" agents (those that read from
   * the shared `.agents/skills` directory) when the skills live there — see
   * note in `readSkillState`.
   */
  editors: Editor[]
  /** Names of the skills to look up (match the `name` field in `skills list --json`). */
  skillNames: string[]
}

interface SkillState {
  /** Display names of agents that have all of these skills installed globally. */
  installedAgentDisplayNames: Set<string>
}

interface SkillListEntry {
  agents?: unknown
  name?: unknown
  path?: unknown
}

/**
 * A skill lives in the shared universal skills directory when its canonical
 * path is under `.agents/skills`. The `skills` CLI installs universal-agent
 * skills there directly (rather than under an agent-specific directory).
 */
function isUniversalSkillPath(skillPath: unknown): boolean {
  return typeof skillPath === 'string' && skillPath.includes(`${UNIVERSAL_SKILLS_DIR}${sep}`)
}

/**
 * Runs the bundled `skills list -g --json` and returns the set of agent
 * display names that have every skill in `skillNames` installed globally.
 * Agents missing any of the skills are excluded, so they get a (idempotent)
 * re-install that fills the gap.
 *
 * "Universal" agents (those whose `skillsDir` is the shared `.agents/skills`
 * directory) are credited whenever every requested skill lives in that shared
 * directory. `skills list` only attributes a skill to agents it independently
 * detects, so a universal editor we detected may be absent from the output even
 * though it reads from the shared directory and already has the skills.
 *
 * Any failure (spawn, parse, timeout, non-zero exit) is debug-logged and
 * resolved with an empty set. Callers should treat that as "treat all agents
 * as not installed" — re-installing is idempotent, so over-installing is
 * safer than skipping based on a flaky probe.
 */
export async function readSkillState(opts: ReadSkillStateOptions): Promise<SkillState> {
  const {editors, skillNames} = opts
  const empty: SkillState = {installedAgentDisplayNames: new Set()}

  let stdout: string
  try {
    const result = await execa(process.execPath, [SKILLS_BIN_PATH, 'list', '-g', '--json'], {
      stdio: 'pipe',
      timeout: 10_000,
    })
    stdout = result.stdout
  } catch (error) {
    debug('skills list failed: %O', error)
    return empty
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch (error) {
    debug('Failed to parse skills list JSON: %O', error)
    return empty
  }

  if (!Array.isArray(parsed)) {
    debug('Unexpected skills list JSON shape (not an array)')
    return empty
  }

  const entries = parsed as SkillListEntry[]

  const agentSets = skillNames.map((skillName) => {
    const match = entries.find((entry) => entry?.name === skillName)
    if (!match || !Array.isArray(match.agents)) {
      return new Set<string>()
    }
    return new Set(match.agents.filter((a): a is string => typeof a === 'string'))
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
      const match = entries.find((entry) => entry?.name === skillName)
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

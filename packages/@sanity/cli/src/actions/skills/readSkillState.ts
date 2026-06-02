import {subdebug} from '@sanity/cli-core'
import {execa} from 'execa'

import {SKILLS_BIN_PATH} from './setupSkills.js'

const debug = subdebug('skills:state')

interface ReadSkillStateOptions {
  /** Name of the skill to look up (matches the `name` field in `skills list --json`). */
  skillName: string
}

interface SkillState {
  /** Display names of agents that have this skill installed globally. */
  installedAgentDisplayNames: Set<string>
}

interface SkillListEntry {
  agents?: unknown
  name?: unknown
}

/**
 * Runs the bundled `skills list -g --json` and returns the set of agent
 * display names that have `skillName` installed globally.
 *
 * Any failure (spawn, parse, timeout, non-zero exit) is debug-logged and
 * resolved with an empty set. Callers should treat that as "treat all agents
 * as not installed" — re-installing is idempotent, so over-installing is
 * safer than skipping based on a flaky probe.
 */
export async function readSkillState(opts: ReadSkillStateOptions): Promise<SkillState> {
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

  const match = (parsed as SkillListEntry[]).find((entry) => entry?.name === opts.skillName)
  if (!match || !Array.isArray(match.agents)) {
    return empty
  }

  const displayNames = match.agents.filter((a): a is string => typeof a === 'string')
  return {installedAgentDisplayNames: new Set(displayNames)}
}

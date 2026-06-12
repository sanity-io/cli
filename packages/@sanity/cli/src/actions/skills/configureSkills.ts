import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {checkbox, logSymbols} from '@sanity/cli-core/ux'

import {detectAvailableEditors} from '../mcp/detectAvailableEditors.js'
import {type EditorName, getSkillsCliAgent} from '../mcp/editorConfigs.js'
import {type Editor} from '../mcp/types.js'
import {setupSkills} from './setupSkills.js'
import {getInstalledSkillAgentDisplayNames, getSkillCandidates} from './skillCandidates.js'

const debug = subdebug('skills:configure')

const NO_EDITORS_MESSAGE =
  'No supported editors detected for Sanity agent skills. See https://www.sanity.io/docs/ai/skills for manual setup.'

type Mode = 'auto' | 'prompt'

interface ConfigureSkillsOptions {
  /**
   * Pre-detected editors. When omitted, `detectAvailableEditors()` is called.
   * Accepting this avoids re-running detection when the caller already has it.
   */
  editors?: Editor[]

  /**
   * - 'prompt': ask the user which editors to install skills for (default)
   * - 'auto': install for every candidate without prompting (non-interactive)
   */
  mode?: Mode
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
 * the user's detected AI editors. Composes the shared detection +
 * `getSkillCandidates` primitives and delegates the actual install to
 * `setupSkills`. Failures are surfaced as warnings and never thrown.
 */
export async function configureSkills(
  options?: ConfigureSkillsOptions,
): Promise<ConfigureSkillsResult> {
  const {mode = 'prompt'} = options ?? {}

  const editors = options?.editors ?? (await detectAvailableEditors())
  const detectedEditors = editors.map((e) => e.name)
  debug('Detected %d editors: %s', detectedEditors.length, detectedEditors)

  const installed = await getInstalledSkillAgentDisplayNames()
  const candidates = getSkillCandidates(editors, installed)

  if (candidates.length === 0) {
    const anyWithSkillSupport = editors.some((e) => getSkillsCliAgent(e.name))
    if (anyWithSkillSupport) {
      ux.stdout(
        `${logSymbols.success} Sanity agent skills already installed for all detected editors`,
      )
    } else {
      ux.warn(NO_EDITORS_MESSAGE)
    }
    return {detectedEditors, installedAgents: [], skipped: true}
  }

  let selected = candidates
  if (mode === 'prompt') {
    const selectedNames = await checkbox({
      choices: candidates.map((c) => ({checked: true, name: c.editor.name, value: c.editor.name})),
      message: 'Install Sanity agent skills for these editors?',
    })

    if (!selectedNames || selectedNames.length === 0) {
      ux.stdout('Skills installation skipped')
      return {detectedEditors, installedAgents: [], skipped: true}
    }

    selected = candidates.filter((c) => selectedNames.includes(c.editor.name))
  }

  const agents = [...new Set(selected.map((c) => c.agent))]
  const result = await setupSkills({agents})

  return {
    detectedEditors,
    error: result.error,
    installedAgents: result.installedAgents,
    skipped: result.skipped,
  }
}

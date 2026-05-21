import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {execa} from 'execa'

import {getErrorMessage, toError} from '../../util/getErrorMessage.js'
import {detectAvailableEditors} from '../mcp/detectAvailableEditors.js'
import {getSkillsCliAgent} from '../mcp/editorConfigs.js'
import {type Editor} from '../mcp/types.js'
import {promptForSkillsSetup} from './promptForSkillsSetup.js'

const skillsDebug = subdebug('skills:setup')

/** Source repo for `npx skills add`. See https://www.sanity.io/docs/ai/skills. */
export const SANITY_SKILLS_REPO = 'sanity-io/agent-toolkit'

interface SetupSkillsOptions {
  /** Working directory for `npx skills add`. Must already exist. */
  cwd: string

  /** Pre-detected editors. When omitted, `detectAvailableEditors()` is called. */
  editors?: Editor[]

  /**
   * - `'auto'`: install for all eligible editors without prompting
   * - `'prompt'`: ask the user with a single yes/no (reserved for a future
   *   `sanity skills add` command — `sanity init` never uses this)
   * - `'skip'`: skip skills installation entirely
   */
  mode?: 'auto' | 'prompt' | 'skip'
}

interface SetupSkillsResult {
  /** `--agent` values passed to `npx skills add` */
  installedAgents: string[]
  installedForEditors: string[]
  skipped: boolean

  error?: Error
}

/**
 * Runs `npx skills add` for every detected editor with a mapped skills agent.
 * Failures are surfaced as warnings and do not throw — skills install is
 * best-effort and must never abort `sanity init`.
 */
export async function setupSkills(options: SetupSkillsOptions): Promise<SetupSkillsResult> {
  const {cwd, mode = 'prompt'} = options
  const empty: SetupSkillsResult = {installedAgents: [], installedForEditors: [], skipped: true}

  if (mode === 'skip') {
    skillsDebug('Skipping skills setup (mode: skip)')
    return empty
  }

  const editors = options.editors ?? (await detectAvailableEditors())

  const eligible = editors.flatMap((editor) => {
    const agent = getSkillsCliAgent(editor.name)
    return agent ? [{agent, editor}] : []
  })

  if (eligible.length === 0) {
    skillsDebug('No detected editors have a skills agent mapping — skipping')
    return empty
  }

  const uniqueAgents = [...new Set(eligible.map((e) => e.agent))]
  const editorLabels = [...new Set(eligible.map((e) => e.editor.name))]

  if (mode === 'prompt') {
    const confirmed = await promptForSkillsSetup()
    if (!confirmed) {
      ux.stdout('Agent skills installation skipped')
      return empty
    }
  }

  const args = [
    '-y',
    'skills',
    'add',
    SANITY_SKILLS_REPO,
    ...uniqueAgents.flatMap((agent) => ['-a', agent]),
    '-y',
  ]

  skillsDebug('Running: npx %s (cwd: %s)', args.join(' '), cwd)

  try {
    const result = await execa('npx', args, {cwd, stdio: 'pipe', timeout: 90_000})
    skillsDebug('skills stdout: %s', result.stdout)
    skillsDebug('skills stderr: %s', result.stderr)
    ux.stdout(`${logSymbols.success} Installed Sanity agent skills for ${editorLabels.join(', ')}`)
    return {
      installedAgents: uniqueAgents,
      installedForEditors: editorLabels,
      skipped: false,
    }
  } catch (error) {
    skillsDebug('Error installing skills %O', error)
    const err = toError(error)
    ux.warn(`Could not install Sanity agent skills: ${getErrorMessage(error)}`)
    if (error && typeof error === 'object') {
      const {stderr, stdout} = error as {stderr?: string; stdout?: string}
      if (stdout) ux.warn(stdout)
      if (stderr) ux.warn(stderr)
    }
    return {
      error: err,
      installedAgents: [],
      installedForEditors: [],
      skipped: false,
    }
  }
}

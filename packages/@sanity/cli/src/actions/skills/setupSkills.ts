import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {execa} from 'execa'

import {getErrorMessage, toError} from '../../util/getErrorMessage.js'
import {EDITOR_CONFIGS} from '../mcp/editorConfigs.js'
import {type Editor} from '../mcp/types.js'

const skillsDebug = subdebug('skills:setup')

/**
 * GitHub repo containing the Sanity agent skills. Installed via `npx skills add`.
 *
 * Source: https://github.com/sanity-io/agent-toolkit (referenced from
 * https://www.sanity.io/docs/ai/skills).
 */
export const SANITY_SKILLS_REPO = 'sanity-io/agent-toolkit'

interface SetupSkillsOptions {
  /**
   * Editors that MCP was (or will be) configured for. Skills will be installed
   * for each editor's mapped `skillsAgent`.
   */
  editors: Editor[]

  /**
   * Controls how skills setup behaves:
   * - 'auto': Install for the editors' mapped agents (default)
   * - 'skip': Skip skills installation entirely
   */
  mode?: 'auto' | 'skip'
}

interface SetupSkillsResult {
  /** `--agent` values that were targeted by `npx skills add` */
  installedAgents: string[]
  skipped: boolean

  error?: Error
}

/**
 * Install Sanity agent skills for the given editors using `npx skills add`.
 *
 * Failures are surfaced as warnings and do not throw — skills install is
 * best-effort and should never abort MCP setup or `sanity init`.
 */
export async function setupSkills(options: SetupSkillsOptions): Promise<SetupSkillsResult> {
  const {editors, mode = 'auto'} = options

  if (mode === 'skip') {
    skillsDebug('Skipping skills installation (mode: skip)')
    return {installedAgents: [], skipped: true}
  }

  const agents = editors.flatMap((editor) => {
    const agent = (EDITOR_CONFIGS[editor.name] as {skillsAgent?: string}).skillsAgent
    return agent ? [agent] : []
  })

  const uniqueAgents = [...new Set(agents)]

  if (uniqueAgents.length === 0) {
    skillsDebug('No editors with a skills agent mapping — skipping')
    return {installedAgents: [], skipped: true}
  }

  const args = [
    '-y',
    'skills',
    'add',
    SANITY_SKILLS_REPO,
    ...uniqueAgents.flatMap((agent) => ['-a', agent]),
    '-y',
  ]

  skillsDebug('Running: npx %s', args.join(' '))

  try {
    await execa('npx', args, {stdio: 'inherit', timeout: 90_000})
    ux.stdout(`${logSymbols.success} Installed Sanity agent skills for ${uniqueAgents.join(', ')}`)
    return {installedAgents: uniqueAgents, skipped: false}
  } catch (error) {
    skillsDebug('Error installing skills %O', error)
    const err = toError(error)
    ux.warn(`Could not install Sanity agent skills: ${getErrorMessage(error)}`)
    return {error: err, installedAgents: [], skipped: false}
  }
}

import fs from 'node:fs/promises'

import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {execa} from 'execa'

import {getErrorMessage, toError} from '../../util/getErrorMessage.js'
import {getSkillsCliAgent} from '../mcp/editorConfigs.js'
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
   * Working directory in which to run `npx skills add`. Required so skills are
   * always written into a concrete project directory rather than wherever the
   * user happened to invoke the CLI from (e.g. `~/dev`).
   */
  cwd: string

  /**
   * Editors that MCP was (or will be) configured for. Skills will be installed
   * for each editor's mapped `skillsCliAgent`.
   */
  editors: Editor[]
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
  const {cwd, editors} = options

  const agents = editors.flatMap((editor) => {
    const agent = getSkillsCliAgent(editor.name)
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

  skillsDebug('Running: npx %s (cwd: %s)', args.join(' '), cwd)

  try {
    // The cwd may not exist yet when called during `sanity init` (project
    // bootstrap happens later). Create it so `npx` doesn't bail with ENOENT.
    await fs.mkdir(cwd, {recursive: true})
    const result = await execa('npx', args, {cwd, stdio: 'pipe', timeout: 90_000})
    skillsDebug('skills stdout: %s', result.stdout)
    skillsDebug('skills stderr: %s', result.stderr)
    ux.stdout(`${logSymbols.success} Installed Sanity agent skills for ${uniqueAgents.join(', ')}`)
    return {installedAgents: uniqueAgents, skipped: false}
  } catch (error) {
    skillsDebug('Error installing skills %O', error)
    const err = toError(error)
    ux.warn(`Could not install Sanity agent skills: ${getErrorMessage(error)}`)
    if (error && typeof error === 'object') {
      const {stderr, stdout} = error as {stderr?: string; stdout?: string}
      if (stdout) ux.warn(stdout)
      if (stderr) ux.warn(stderr)
    }
    return {error: err, installedAgents: [], skipped: false}
  }
}

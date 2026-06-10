import {fileURLToPath} from 'node:url'

import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {execa} from 'execa'

import {getErrorMessage, toError} from '../../util/getErrorMessage.js'

const skillsDebug = subdebug('skills:setup')

/** Source repo for the bundled `skills` CLI. See https://www.sanity.io/docs/ai/skills. */
export const SANITY_SKILLS_REPO = 'sanity-io/agent-toolkit'

/** Names of the skills we install — must match the entries in the source repo. */
export const SANITY_SKILL_NAMES = ['sanity-best-practices', 'sanity-migration']

/**
 * Absolute path to the bundled `skills` CLI bin. Resolved once at module load
 * via `import.meta.resolve` so we run the version pinned in our package.json
 * instead of paying the `npx -y` registry lookup at runtime.
 */
export const SKILLS_BIN_PATH = fileURLToPath(
  import.meta.resolve('skills/bin/cli.mjs', import.meta.url),
)

interface SetupSkillsOptions {
  /** Skills-CLI agent IDs (e.g. 'cursor', 'claude-code') to install for. */
  agents: string[]
}

interface SetupSkillsResult {
  /** Deduplicated `--agent` values passed to `skills add`. */
  installedAgents: string[]
  skipped: boolean

  error?: Error
}

/**
 * Runs the bundled `skills add` globally for the given agents. Failures are
 * surfaced as warnings and never throw — skills install is best-effort and
 * must not abort `sanity init`.
 */
export async function setupSkills(options: SetupSkillsOptions): Promise<SetupSkillsResult> {
  const uniqueAgents = [...new Set(options.agents)]

  if (uniqueAgents.length === 0) {
    skillsDebug('No agents passed — skipping skills install')
    return {installedAgents: [], skipped: true}
  }

  const args = [
    SKILLS_BIN_PATH,
    'add',
    SANITY_SKILLS_REPO,
    '--skill',
    ...SANITY_SKILL_NAMES,
    '-g',
    ...uniqueAgents.flatMap((agent) => ['-a', agent]),
    '-y',
  ]

  skillsDebug('Running: %s %s', process.execPath, args.join(' '))

  try {
    const result = await execa(process.execPath, args, {stdio: 'pipe', timeout: 90_000})
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

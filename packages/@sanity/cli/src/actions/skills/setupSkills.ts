import {fileURLToPath} from 'node:url'
import {styleText} from 'node:util'

import {type Output, subdebug} from '@sanity/cli-core'
import {logSymbols, spinner} from '@sanity/cli-core/ux'
import {execa} from 'execa'

import {getErrorMessage, toError} from '../../util/getErrorMessage.js'
import {
  getSkillsCliAgentDisplayNameById,
  getSkillsCliAgentSkillsDir,
  UNIVERSAL_SKILLS_DIR,
} from '../mcp/editorConfigs.js'

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

  /**
   * Output to use for user-facing messages, so they go through the calling
   * command rather than directly to stdout/stderr.
   */
  output: Output
}

interface SetupSkillsResult {
  /** Deduplicated `--agent` values passed to `skills add`. */
  installedAgents: string[]
  skipped: boolean

  error?: Error
}

/**
 * Prints a short summary beneath the success line: the skills that were
 * installed, grouped by where they live. Universal agents share
 * `~/.agents/skills`, so they're listed together under one header; any agent
 * with its own directory (e.g. Claude Code) is listed separately with its
 * location. Global (`-g`) installs are home-anchored, so locations show `~/`.
 */
function printInstallSummary(agents: string[], output: Output): void {
  const universal: string[] = []
  const additional: {dir: string; name: string}[] = []

  for (const agent of agents) {
    const name = getSkillsCliAgentDisplayNameById(agent) ?? agent
    const dir = getSkillsCliAgentSkillsDir(agent)
    if (dir && dir !== UNIVERSAL_SKILLS_DIR) {
      additional.push({dir, name})
    } else {
      universal.push(name)
    }
  }

  if (universal.length > 0) {
    output.log('')
    output.log(styleText('dim', `  Universal (~/${UNIVERSAL_SKILLS_DIR})`))
    output.log(styleText('dim', `    ${universal.join(', ')}`))
  }

  if (additional.length > 0) {
    output.log('')
    output.log(styleText('dim', '  Additional agents'))
    for (const {dir, name} of additional) {
      output.log(styleText('dim', `    ${name} (~/${dir})`))
    }
  }
  output.log('')
}

/**
 * Runs the bundled `skills add` globally for the given agents. Failures are
 * surfaced as warnings and never throw — skills install is best-effort and
 * must not abort `sanity init`.
 */
export async function setupSkills(options: SetupSkillsOptions): Promise<SetupSkillsResult> {
  const {output} = options
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

  const spin = spinner('Installing Sanity agent skills').start()

  try {
    const result = await execa(process.execPath, args, {stdio: 'pipe', timeout: 90_000})
    skillsDebug('skills stdout: %s', result.stdout)
    skillsDebug('skills stderr: %s', result.stderr)
    spin.stop()
    output.log(
      `${logSymbols.success} Sanity agent skills installed: [${SANITY_SKILL_NAMES.join(', ')}]`,
    )
    printInstallSummary(uniqueAgents, output)
    return {installedAgents: uniqueAgents, skipped: false}
  } catch (error) {
    skillsDebug('Error installing skills %O', error)
    const err = toError(error)
    spin.stop()
    output.warn(`Could not install Sanity agent skills: ${getErrorMessage(error)}`)
    if (error && typeof error === 'object') {
      const {stderr, stdout} = error as {stderr?: string; stdout?: string}
      if (stdout) output.warn(stdout)
      if (stderr) output.warn(stderr)
    }
    return {error: err, installedAgents: [], skipped: false}
  }
}

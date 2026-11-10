import {styleText} from 'node:util'

import {type Output, subdebug} from '@sanity/cli-core'
import {getErrorMessage, toError} from '@sanity/cli-core/errors'
import {logSymbols, spinner} from '@sanity/cli-core/ux'

import {
  getSkillsCliAgentDisplayNameById,
  getSkillsCliAgentSkillsDir,
  UNIVERSAL_SKILLS_DIR,
} from '../mcp/editorConfigs.js'

const skillsDebug = subdebug('skills:setup')

/** Source repo for the bundled `skills` package. See https://www.sanity.io/docs/ai/skills. */
export const SANITY_SKILLS_REPO = 'sanity-io/agent-toolkit'

/** Names of the skills we install — must match the entries in the source repo. */
export const SANITY_SKILL_NAMES = ['sanity-best-practices', 'sanity-migration']

/** Upper bound for fetching and installing the skills (checked between steps). */
const INSTALL_TIMEOUT_MS = 90_000

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
  /** Deduplicated agent IDs the skills were installed for. */
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
 * Installs the Sanity skills globally for the given agents using the bundled
 * `skills` package's programmatic API (equivalent to
 * `skills add <repo> --skill <names> -g -a <agent>... -y`). Failures are
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

  skillsDebug(
    'Installing %s from %s globally for agents: %s',
    SANITY_SKILL_NAMES.join(', '),
    SANITY_SKILLS_REPO,
    uniqueAgents.join(', '),
  )

  const spin = spinner('Installing Sanity agent skills').start()

  try {
    // Loaded lazily so a problem with the `skills` package only affects this
    // best-effort step, not every command that imports this module.
    // eslint-disable-next-line no-restricted-syntax -- package import, not a file path
    const {installSkills} = await import('skills')
    const result = await installSkills(SANITY_SKILLS_REPO, {
      agents: uniqueAgents,
      onWarning: (warning) => skillsDebug('skills warning: %s', warning.message),
      scope: 'global',
      signal: AbortSignal.timeout(INSTALL_TIMEOUT_MS),
      skills: SANITY_SKILL_NAMES,
    })
    skillsDebug('skills install result: %O', result)
    spin.stop()

    const failedAgents = new Set(result.failed.map((failure) => failure.agent))
    const installedAgents = uniqueAgents.filter((agent) => !failedAgents.has(agent))

    if (installedAgents.length > 0) {
      output.log(
        `${logSymbols.success} Sanity agent skills installed: [${SANITY_SKILL_NAMES.join(', ')}]`,
      )
      printInstallSummary(installedAgents, output)
    }

    if (result.failed.length === 0) {
      return {installedAgents, skipped: false}
    }

    const failureMessages = result.failed.map((failure) => failure.message)
    output.warn(
      installedAgents.length > 0
        ? 'Could not install Sanity agent skills for some agents:'
        : 'Could not install Sanity agent skills:',
    )
    for (const message of failureMessages) output.warn(message)
    return {error: new Error(failureMessages.join('\n')), installedAgents, skipped: false}
  } catch (error) {
    skillsDebug('Error installing skills %O', error)
    const err = toError(error)
    spin.stop()
    output.warn(`Could not install Sanity agent skills: ${getErrorMessage(error)}`)
    const fix = (error as {fix?: unknown} | null)?.fix
    if (typeof fix === 'string' && fix) output.warn(fix)
    return {error: err, installedAgents: [], skipped: false}
  }
}

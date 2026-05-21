import fs from 'node:fs/promises'
import path from 'node:path'

import {ux} from '@oclif/core'
import {subdebug} from '@sanity/cli-core'
import {logSymbols} from '@sanity/cli-core/ux'
import {execa} from 'execa'

import {getErrorMessage, toError} from '../../util/getErrorMessage.js'
import {SKILLS_BIN_PATH} from './setupSkills.js'

const debug = subdebug('skills:update')

const SKILLS_LOCK_FILENAME = 'skills-lock.json'

/**
 * GitHub orgs whose skills we consider "Sanity-owned" and therefore in scope
 * for `sanity skills update`. Keep these in sync with the org names actually
 * used on github.com.
 */
const SANITY_GITHUB_ORGS = ['sanity-io', 'sanity-labs'] as const

interface SkillsLockfile {
  skills?: Record<string, {source?: string} | undefined>
}

/**
 * Returns true when a `skills-lock.json` `source` string points at a
 * Sanity-owned GitHub repo. Matches the two forms the upstream `skills`
 * CLI actually writes — see `getOwnerRepo` + `lockSource` in skills/dist:
 *   - `org/repo` shorthand (any HTTP(S) GitHub input gets normalized down
 *     to this)
 *   - `git@github.com:org/repo.git` (only when the user typed an SSH URL,
 *     in which case skills keeps the raw URL as the source)
 */
export function isSanityOwnedSource(source: string | undefined): boolean {
  if (!source) return false
  const normalized = source.trim().toLowerCase()
  return SANITY_GITHUB_ORGS.some(
    (org) => normalized.startsWith(`${org}/`) || normalized.startsWith(`git@github.com:${org}/`),
  )
}

interface RunSkillsUpdateOptions {
  /** Working directory for the `skills update` invocation. */
  cwd: string
}

interface RunSkillsUpdateResult {
  /** True when there were no Sanity skills installed to update. */
  noOp: boolean
  /** Captured stdout from the underlying `skills update` invocation. */
  stdout: string
  succeeded: boolean
  /** Skill names that were passed to `skills update`. */
  updatedSkills: string[]

  error?: Error
}

/**
 * Reads `skills-lock.json` from `cwd` and returns the names of skills whose
 * source points at a Sanity-owned GitHub repo. Returns an empty array when
 * the lockfile is missing or unreadable.
 */
async function readSanitySkillNames(cwd: string): Promise<string[]> {
  const lockPath = path.join(cwd, SKILLS_LOCK_FILENAME)

  let raw: string
  try {
    raw = await fs.readFile(lockPath, 'utf8')
  } catch (error) {
    debug('No skills-lock.json found at %s (%O)', lockPath, error)
    return []
  }

  let parsed: SkillsLockfile
  try {
    parsed = JSON.parse(raw) as SkillsLockfile
  } catch (error) {
    debug('Failed to parse %s: %O', lockPath, error)
    return []
  }

  const skills = parsed.skills ?? {}
  return Object.entries(skills).flatMap(([name, info]) =>
    isSanityOwnedSource(info?.source) ? [name] : [],
  )
}

/**
 * Runs the bundled `skills update --project -y <skills...>` for every
 * project skill whose `source` points at a Sanity-owned GitHub org (see
 * `SANITY_GITHUB_ORGS`), leaving non-Sanity project skills untouched.
 *
 * Sources are read from `skills-lock.json`; if the lockfile is missing or
 * contains no Sanity skills the call is a no-op. Failures are surfaced as
 * warnings and do not throw.
 */
export async function runSkillsUpdate({
  cwd,
}: RunSkillsUpdateOptions): Promise<RunSkillsUpdateResult> {
  const sanitySkills = await readSanitySkillNames(cwd)

  if (sanitySkills.length === 0) {
    ux.stdout(
      `No official Sanity skills to update. Run \`sanity skills add\` to install Sanity agent skills.`,
    )
    return {noOp: true, stdout: '', succeeded: true, updatedSkills: []}
  }

  const args = [SKILLS_BIN_PATH, 'update', '--project', '-y', ...sanitySkills]
  debug('Running: %s %s (cwd: %s)', process.execPath, args.join(' '), cwd)

  try {
    const result = await execa(process.execPath, args, {cwd, stdio: 'pipe', timeout: 120_000})
    debug('skills stdout: %s', result.stdout)
    debug('skills stderr: %s', result.stderr)
    ux.stdout(
      `${logSymbols.success} Updated ${sanitySkills.length} Sanity agent skill${sanitySkills.length === 1 ? '' : 's'}: ${sanitySkills.join(', ')}`,
    )
    return {
      noOp: false,
      stdout: result.stdout,
      succeeded: true,
      updatedSkills: sanitySkills,
    }
  } catch (error) {
    debug('Error updating skills %O', error)
    ux.warn(`Could not update Sanity agent skills: ${getErrorMessage(error)}`)
    if (error && typeof error === 'object') {
      const {stderr, stdout} = error as {stderr?: string; stdout?: string}
      if (stdout) ux.warn(stdout)
      if (stderr) ux.warn(stderr)
    }
    return {
      error: toError(error),
      noOp: false,
      stdout: '',
      succeeded: false,
      updatedSkills: [],
    }
  }
}

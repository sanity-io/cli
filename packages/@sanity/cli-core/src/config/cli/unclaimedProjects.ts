import fs from 'node:fs'
import path from 'node:path'

import {parse as parseDotenv} from 'dotenv'

import {debug} from '../../_exports/debug.js'

/** User config key holding minted-but-unclaimed projects, keyed by project id. */
export const UNCLAIMED_PROJECTS_CONFIG_KEY = 'unclaimedProjects'

/**
 * Read a single key straight from the directory's `.env`, using dotenv's grammar so it matches
 * `readEnvValues` (used by mint/init/logout/nudges) exactly. Unlike Vite's `loadEnv`, it ignores
 * `process.env`, so a shell `export` from another project can't shadow this directory's `.env`.
 */
function readEnvFileValue(cwd: string, key: string): string | undefined {
  const envPath = path.join(cwd, '.env')
  if (!fs.existsSync(envPath)) return undefined
  return parseDotenv(fs.readFileSync(envPath, 'utf8'))[key]?.trim() || undefined
}

/**
 * Resolve the robot token for the minted project the current directory points at, given the
 * ledger `records` (the `unclaimedProjects` config value). Lets the CLI authenticate in a freshly
 * minted directory that has no config file — where env injection never runs. The token is owned
 * by the ledger, not `.env`: `.env` only carries the non-secret project id. Never throws.
 */
export function resolveMintedProjectToken(
  records: unknown,
  cwd: string = process.cwd(),
): string | undefined {
  try {
    if (!records || typeof records !== 'object') return undefined

    const projectId = readEnvFileValue(cwd, 'SANITY_PROJECT_ID')
    if (!projectId) return undefined

    const record = (records as Record<string, {token?: unknown}>)[projectId]
    return typeof record?.token === 'string' ? record.token : undefined
  } catch (err) {
    debug('failed to resolve minted project token: %s', err)
    return undefined
  }
}

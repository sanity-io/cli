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

export interface MintedProjectCredential {
  projectId: string
  token: string
}

/**
 * Resolve the robot credential for the minted project the current directory points at, given the
 * ledger `records` (the `unclaimedProjects` config value). Lets the CLI authenticate in a freshly
 * minted directory that has no config file — where env injection never runs. The ledger remains
 * authoritative when it has a usable token; the root `.env` token is the recovery path when the
 * ledger write failed. Mint writes both values before scaffolding, and `.env` must stay gitignored.
 * Never throws.
 */
export function resolveMintedProjectCredential(
  records: unknown,
  cwd: string = process.cwd(),
): MintedProjectCredential | undefined {
  try {
    const projectId = readEnvFileValue(cwd, 'SANITY_PROJECT_ID')
    if (!projectId) return undefined

    const record =
      records && typeof records === 'object'
        ? (records as Record<string, {token?: unknown}>)[projectId]
        : undefined
    const recordToken = record?.token
    if (typeof recordToken === 'string' && recordToken.trim()) {
      return {projectId, token: recordToken}
    }

    // Mint can still persist the project-local credential if its separate user-config ledger
    // write fails. Read only this directory's `.env` (never process.env or nested Studio env)
    // so commands at the mint root can authenticate without silently taking another project's
    // shell export.
    const envToken = readEnvFileValue(cwd, 'SANITY_AUTH_TOKEN')
    return envToken ? {projectId, token: envToken} : undefined
  } catch (err) {
    debug('failed to resolve minted project credential: %s', err)
    return undefined
  }
}

/**
 * Token-only view of {@link resolveMintedProjectCredential}, kept for existing consumers.
 */
export function resolveMintedProjectToken(
  records: unknown,
  cwd: string = process.cwd(),
): string | undefined {
  return resolveMintedProjectCredential(records, cwd)?.token
}

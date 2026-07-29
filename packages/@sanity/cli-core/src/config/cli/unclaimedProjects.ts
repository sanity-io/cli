import fs from 'node:fs'
import path from 'node:path'

import {parse as parseDotenv} from 'dotenv'

import {debug} from '../../_exports/debug.js'

/** User config key holding minted-but-unclaimed projects, keyed by project id. */
export const UNCLAIMED_PROJECTS_CONFIG_KEY = 'unclaimedProjects'

const MINTED_CREDENTIAL_BOUNDARY_KEYS = [
  'SANITY_AUTH_TOKEN',
  'SANITY_CLAIM_URL',
  'SANITY_PROJECT_ID',
] as const

function mentionsMintedCredentialBoundary(contents: string): boolean {
  return contents.split(/\r?\n/u).some((line) => {
    let statement = line.trimStart()
    if (!statement || statement.startsWith('#')) return false

    statement = statement.replace(/^export\s+/u, '')
    return MINTED_CREDENTIAL_BOUNDARY_KEYS.some((key) => {
      if (!statement.startsWith(key)) return false
      const nextCharacter = statement[key.length]
      return nextCharacter === undefined || !/[A-Z0-9_]/iu.test(nextCharacter)
    })
  })
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/**
 * Find the nearest ancestor `.env` that establishes a Sanity credential boundary. The walk stays
 * lexical, parses only the selected file, and never consults or mutates `process.env`.
 */
function readMintedProjectEnv(cwd: string): Record<string, string> | undefined {
  let directory = path.resolve(cwd)

  while (true) {
    let contents: string | undefined
    try {
      contents = fs.readFileSync(path.join(directory, '.env'), 'utf8')
    } catch (error) {
      if (!isMissingFileError(error)) return undefined
    }

    if (contents !== undefined && mentionsMintedCredentialBoundary(contents)) {
      return parseDotenv(contents)
    }

    const parent = path.dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

export interface MintedProjectCredential {
  projectId: string
  token: string
}

/**
 * Resolve the robot credential selected by the nearest ancestor `.env` credential boundary, given
 * the ledger `records` (the `unclaimedProjects` config value). Lets the CLI authenticate from a
 * freshly minted root or its generated descendants. The ledger remains authoritative when its
 * record matches the selected project and has a usable token; the same `.env` token is the recovery
 * path when the ledger write failed. Mint writes both values before scaffolding, and `.env` must
 * stay gitignored. Never throws.
 */
export function resolveMintedProjectCredential(
  records: unknown,
  cwd: string = process.cwd(),
): MintedProjectCredential | undefined {
  try {
    const env = readMintedProjectEnv(cwd)
    if (!env) return undefined

    const projectId = env.SANITY_PROJECT_ID?.trim()
    if (!projectId) return undefined

    const record: unknown =
      records && typeof records === 'object'
        ? (records as Record<string, unknown>)[projectId]
        : undefined
    if (record && typeof record === 'object' && !Array.isArray(record)) {
      const {projectId: recordProjectId, token: recordToken} = record as Record<string, unknown>
      if (recordProjectId === projectId && typeof recordToken === 'string' && recordToken.trim()) {
        return {projectId, token: recordToken}
      }
    }

    // Mint can still persist the project-local credential if its separate user-config ledger
    // write fails. Read only the selected boundary's `.env` (never process.env or another env file)
    // so descendants can authenticate without silently taking another project's shell export.
    const envToken = env.SANITY_AUTH_TOKEN?.trim()
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

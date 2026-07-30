import {getUserConfig} from '@sanity/cli-core/config'
import {subdebug} from '@sanity/cli-core/debug'

import {type MintedProject} from '../services/mintProject.js'

const debug = subdebug('projects:unclaimed:registry')

export const UNCLAIMED_PROJECTS_CONFIG_KEY = 'unclaimedProjects'

export interface UnclaimedProjectRecord {
  claimToken: string
  claimUrl: string
  dataset: string
  expiresAt: string
  mintedAt: string
  projectId: string
  token: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * Record a mint response in the passive, project-ID-keyed user-config registry.
 *
 * This storage is deliberately not connected to CLI credential resolution.
 */
export function recordUnclaimedProject(
  minted: MintedProject,
  mintedAt: string = new Date().toISOString(),
): boolean {
  try {
    const config = getUserConfig()
    const records = asRecord(config.get(UNCLAIMED_PROJECTS_CONFIG_KEY))
    const record: UnclaimedProjectRecord = {
      claimToken: minted.claimToken,
      claimUrl: minted.claimUrl,
      dataset: minted.datasetName,
      expiresAt: minted.expiresAt,
      mintedAt,
      projectId: minted.resourceId,
      token: minted.token,
    }

    config.set(UNCLAIMED_PROJECTS_CONFIG_KEY, {
      ...records,
      [minted.resourceId]: record,
    })
    return true
  } catch (error) {
    debug(
      'failed to record unclaimed project: %s',
      error instanceof Error ? error.message : `${error}`,
    )
    return false
  }
}

function requireString(
  value: Record<string, unknown>,
  key: keyof UnclaimedProjectRecord,
  projectId: string,
): string {
  const field = value[key]
  if (typeof field !== 'string' || field.length === 0) {
    throw new Error(
      `Local recovery record for project "${projectId}" is malformed: "${key}" is missing or invalid.`,
    )
  }
  return field
}

function parseRecord(projectId: string, value: unknown): UnclaimedProjectRecord {
  const record = asRecord(value)
  const parsed: UnclaimedProjectRecord = {
    claimToken: requireString(record, 'claimToken', projectId),
    claimUrl: requireString(record, 'claimUrl', projectId),
    dataset: requireString(record, 'dataset', projectId),
    expiresAt: requireString(record, 'expiresAt', projectId),
    mintedAt: requireString(record, 'mintedAt', projectId),
    projectId: requireString(record, 'projectId', projectId),
    token: requireString(record, 'token', projectId),
  }

  if (parsed.projectId !== projectId) {
    throw new Error(
      `Local recovery record for project "${projectId}" is malformed: its project ID does not match.`,
    )
  }
  let claimUrlValid = false
  try {
    const protocol = new URL(parsed.claimUrl).protocol
    claimUrlValid = protocol === 'https:' || protocol === 'http:'
  } catch {
    // The actionable error is reported below.
  }
  if (!claimUrlValid) {
    throw new TypeError(
      `Local recovery record for project "${projectId}" is malformed: "claimUrl" is not a valid URL.`,
    )
  }
  if (!Number.isFinite(Date.parse(parsed.mintedAt))) {
    throw new TypeError(
      `Local recovery record for project "${projectId}" is malformed: "mintedAt" is not a valid date.`,
    )
  }
  if (!Number.isFinite(Date.parse(parsed.expiresAt))) {
    throw new TypeError(
      `Local recovery record for project "${projectId}" is malformed: "expiresAt" is not a valid date.`,
    )
  }

  return parsed
}

/**
 * Read and validate the passive local recovery registry without changing it.
 */
export function readUnclaimedProjects(): UnclaimedProjectRecord[] {
  const stored = getUserConfig().get(UNCLAIMED_PROJECTS_CONFIG_KEY)
  if (stored === undefined) return []
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    throw new Error('The local unclaimed-project registry is malformed.')
  }

  return Object.entries(stored)
    .map(([projectId, record]) => parseRecord(projectId, record))
    .toSorted((left, right) => right.mintedAt.localeCompare(left.mintedAt))
}

/**
 * Remove a record only when its claim token still matches the record that was checked.
 */
export function removeUnclaimedProject(projectId: string, expectedClaimToken: string): boolean {
  try {
    const config = getUserConfig()
    const records = asRecord(config.get(UNCLAIMED_PROJECTS_CONFIG_KEY))
    const current = asRecord(records[projectId])
    if (current.claimToken !== expectedClaimToken) return false

    const {[projectId]: _, ...remaining} = records
    if (Object.keys(remaining).length === 0) {
      config.delete(UNCLAIMED_PROJECTS_CONFIG_KEY)
    } else {
      config.set(UNCLAIMED_PROJECTS_CONFIG_KEY, remaining)
    }
    return true
  } catch (error) {
    debug(
      'failed to remove unclaimed project: %s',
      error instanceof Error ? error.message : `${error}`,
    )
    return false
  }
}

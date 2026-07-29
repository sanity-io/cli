import {getUserConfig} from '@sanity/cli-core/config'
import {subdebug} from '@sanity/cli-core/debug'

import {type MintedProject} from '../services/mintProject.js'

const debug = subdebug('projects:mint:registry')

export const UNCLAIMED_PROJECTS_CONFIG_KEY = 'unclaimedProjects'

interface UnclaimedProjectRecord {
  claimToken: string
  claimUrl: string
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

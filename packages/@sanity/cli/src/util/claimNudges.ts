import {styleText} from 'node:util'

import {getUserConfig} from '@sanity/cli-core'
import {UNCLAIMED_PROJECTS_CONFIG_KEY} from '@sanity/cli-core/config'
import {subdebug} from '@sanity/cli-core/debug'
import {logSymbols} from '@sanity/cli-core/ux'

import {
  type ClaimState,
  lookupClaimStateViaProject,
  type MintedProject,
} from '../services/mintProject.js'
import {TOKEN_ENV_FILES} from './envFile.js'
import {CLAIM_WINDOW_HOURS} from './mintProjectConstants.js'

const debug = subdebug('claimNudges')

export interface UnclaimedProjectRecord {
  claimToken: string
  claimUrl: string
  expiresAt: string
  mintedAt: string
  projectId: string

  /** Robot token, used to read claim state as a function of organization membership. */
  token?: string
}

const unit = (n: number, name: string) => `${n} ${name}${n === 1 ? '' : 's'}`

export function formatMsLeft(msLeft: number): string {
  const totalMinutes = Math.max(Math.floor(msLeft / 60_000), 1)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return unit(minutes, 'minute')
  if (minutes === 0) return unit(hours, 'hour')
  return `${unit(hours, 'hour')} ${unit(minutes, 'minute')}`
}

function isWellFormed(record: unknown): record is UnclaimedProjectRecord {
  const candidate = record as Partial<UnclaimedProjectRecord> | null
  return (
    typeof candidate?.claimToken === 'string' &&
    typeof candidate?.claimUrl === 'string' &&
    typeof candidate?.expiresAt === 'string' &&
    typeof candidate?.projectId === 'string'
  )
}

function readRecords(): Record<string, UnclaimedProjectRecord> {
  const raw = getUserConfig().get(UNCLAIMED_PROJECTS_CONFIG_KEY)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(
      ([key, record]) => isWellFormed(record) && record.projectId === key,
    ),
  ) as Record<string, UnclaimedProjectRecord>
}

function writeRecords(records: Record<string, UnclaimedProjectRecord>): void {
  const config = getUserConfig()
  if (Object.keys(records).length === 0) {
    config.delete(UNCLAIMED_PROJECTS_CONFIG_KEY)
  } else {
    config.set(UNCLAIMED_PROJECTS_CONFIG_KEY, records)
  }
}

/**
 * Persist a minted project to the ledger. Returns whether the write succeeded: in a freshly minted
 * directory with no Sanity config, `.env` is not auto-injected, so the ledger is the only path by
 * which `getCliToken` can authenticate — callers must surface a failure rather than report success.
 */
export function recordMintedProject(minted: MintedProject): boolean {
  try {
    const records = readRecords()
    records[minted.resourceId] = {
      claimToken: minted.claimToken,
      claimUrl: minted.claimUrl,
      expiresAt: minted.expiresAt,
      mintedAt: new Date().toISOString(),
      projectId: minted.resourceId,
      token: minted.token,
    }
    writeRecords(records)
    return true
  } catch (err) {
    debug('failed to record minted project: %s', err)
    return false
  }
}

export function getMintedProjectRecord(projectId: string): UnclaimedProjectRecord | undefined {
  try {
    return readRecords()[projectId]
  } catch (err) {
    debug('failed to read minted project record: %s', err)
    return undefined
  }
}

/**
 * Drop a minted project from the ledger when a re-mint supersedes an expired one,
 * or flag failure for project re-minting visibility, to prevent silent proliferation.
 */
export function forgetMintedProject(projectId: string): boolean {
  try {
    const records = readRecords()
    if (!(projectId in records)) return true
    delete records[projectId]
    writeRecords(records)
    return true
  } catch (err) {
    debug('failed to forget minted project: %s', err)
    return false
  }
}

function renderReminder(
  record: UnclaimedProjectRecord,
  msLeft: number,
  {solo = true} = {},
): string {
  const agentCta =
    styleText(
      'dim',
      'If you are an agent: give this claim URL to the person you are working for.',
    ) +
    '\n' +
    styleText('dim', 'They have to open it themselves before the deadline.')

  const urgent = msLeft <= 24 * 3_600_000
  const headline = `Unclaimed Sanity project ${record.projectId} expires in ${formatMsLeft(msLeft)}`
  const base =
    `${styleText(['bold', urgent ? 'red' : 'yellow'], headline)}\n` +
    `Claim it now: there's no downside to claiming early, and everything keeps working, including the token in .env.\n` +
    styleText(['cyan', 'underline'], record.claimUrl)
  if (!solo) return base
  return (
    `${base}\n\n` +
    `Everything in it is permanently deleted at ${record.expiresAt} unless you claim it.\n` +
    agentCta
  )
}

function renderAggregateReminder(live: Array<{msLeft: number; record: UnclaimedProjectRecord}>) {
  const header =
    live.length === 1
      ? '1 more unclaimed Sanity project, permanently deleted at its deadline unless you claim it:'
      : `${live.length} more unclaimed Sanity projects, each permanently deleted at its deadline unless you claim it:`
  const lines = live.map(
    ({msLeft, record}) =>
      `${styleText('cyan', record.projectId)} expires in ${formatMsLeft(msLeft)}: ${styleText(['cyan', 'underline'], record.claimUrl)}`,
  )
  return (
    `${header}\n\n` +
    `${lines.join('\n')}\n\n` +
    styleText(
      'dim',
      'If you are an agent: give every claim URL above to the person you are working for.',
    ) +
    '\n' +
    styleText('dim', 'They have to open each one themselves before its deadline.')
  )
}

const claimedMessage = (record: UnclaimedProjectRecord): string =>
  // The robot token stays in `.env` after claim; let the user know.
  `${logSymbols.success} Sanity project ${record.projectId} has been claimed. It's yours to keep.\n` +
  `CLI commands here still authenticate with the robot token. Run \`sanity login\`, then remove SANITY_AUTH_TOKEN from ${TOKEN_ENV_FILES} to act as yourself.`
const expiredMessage = (record: UnclaimedProjectRecord): string =>
  // `--force` mints a replacement and leaves `.env` for you to update.
  `The server confirmed that unclaimed Sanity project ${record.projectId} expired on ${record.expiresAt}. Its project and content are permanently gone and no longer recoverable. Run \`sanity new --force\` to create a replacement. Claim the replacement within ${CLAIM_WINDOW_HOURS} hours to keep it.`
const unverifiedExpiryMessage = (record: UnclaimedProjectRecord): string =>
  `${logSymbols.warning} Sanity project ${record.projectId} reached its recorded claim deadline on ${record.expiresAt}, but its current state couldn't be verified. It may still be claimable; try ${record.claimUrl}. Its local credentials have been kept so a temporary network failure cannot discard access.`
const revokedMessage = (record: UnclaimedProjectRecord): string =>
  // The dead token is no longer valid; let the user know.
  `${logSymbols.warning} Sanity project ${record.projectId}'s token is no longer valid. Run \`sanity login\`, then remove SANITY_AUTH_TOKEN from ${TOKEN_ENV_FILES} to act as yourself.`

export async function runClaimNudges(
  write: (line: string) => void,
  now: number = Date.now(),
): Promise<void> {
  const records = readRecords()
  if (Object.keys(records).length === 0) return

  const announce = (message: string) => {
    write(`\n${message}\n`)
  }

  const dropped = new Set<string>()
  const drop = (projectId: string) => {
    delete records[projectId]
    dropped.add(projectId)
  }

  // Fall back to the local clock when unverifiable.
  const confirm = async (record: UnclaimedProjectRecord): Promise<ClaimState | undefined> => {
    if (!record.token) return undefined
    return lookupClaimStateViaProject(record.projectId, record.token)
  }

  const live: Array<{msLeft: number; record: UnclaimedProjectRecord}> = []
  const entries = Object.values(records)
  const states = await Promise.all(entries.map((record) => confirm(record)))

  for (const [index, record] of entries.entries()) {
    const msLeft = new Date(record.expiresAt).getTime() - now
    const state = states[index]
    switch (state) {
      case 'claimed': {
        announce(claimedMessage(record))
        drop(record.projectId)
        break
      }
      case 'expired': {
        announce(expiredMessage(record))
        drop(record.projectId)
        break
      }
      case 'revoked': {
        announce(revokedMessage(record))
        drop(record.projectId)
        break
      }
      default: {
        if (msLeft > 0) {
          live.push({msLeft, record})
        } else if (state === undefined) {
          // A failed lookup is not proof of deletion. Keep the claim URL and robot token until
          // the server confirms a terminal state; a later run can reconcile the record.
          announce(unverifiedExpiryMessage(record))
        }
        // Locally expired but confirmed claimable (clock skew or an extended window): keep the
        // record quietly and let the next run re-check.
      }
    }
  }

  live.sort((a, b) => a.msLeft - b.msLeft)
  const [lead, ...rest] = live
  if (lead && rest.length === 0) {
    announce(renderReminder(lead.record, lead.msLeft))
  } else if (lead) {
    announce(renderReminder(lead.record, lead.msLeft, {solo: false}))
    announce(renderAggregateReminder(rest))
  }

  if (dropped.size > 0) {
    // Re-read so a sibling process's writes survive; only the ids we dropped are removed.
    const fresh = readRecords()
    for (const id of dropped) delete fresh[id]
    writeRecords(fresh)
  }
}

export {UNCLAIMED_PROJECTS_CONFIG_KEY} from '@sanity/cli-core/config'

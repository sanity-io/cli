import path from 'node:path'
import {styleText} from 'node:util'

import {getUserConfig, UNCLAIMED_PROJECTS_CONFIG_KEY} from '@sanity/cli-core'
import {subdebug} from '@sanity/cli-core/debug'
import {logSymbols} from '@sanity/cli-core/ux'

import {
  type ClaimState,
  lookupClaimStateViaProject,
  type MintedProject,
} from '../services/mintProject.js'
import {readEnvValues} from './envFile.js'

const debug = subdebug('claimNudges')

export interface UnclaimedProjectRecord {
  claimToken: string
  claimUrl: string
  expiresAt: string
  mintedAt: string
  projectId: string

  /** Highest nudge tier already shown. */
  lastNudgeTier?: number

  /** Robot token, used to read claim state as a function of organization membership. */
  token?: string
}

const NUDGE_TIERS = [
  {ms: 48 * 3_600_000, tier: 1},
  {ms: 24 * 3_600_000, tier: 2},
  {ms: 8 * 3_600_000, tier: 3},
  {ms: 2 * 3_600_000, tier: 4},
] as const

function tierFor(msLeft: number): number {
  let current = 0
  for (const {ms, tier} of NUDGE_TIERS) {
    if (msLeft <= ms) current = tier
  }
  return current
}

function humanizeMsLeft(msLeft: number): string {
  const minutes = Math.max(Math.round(msLeft / 60_000), 1)
  if (minutes < 120) return `about ${minutes} minutes`
  const hours = Math.round(minutes / 60)
  return `about ${hours} hours`
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

function renderNudge(record: UnclaimedProjectRecord, tier: number, msLeft: number): string {
  const timeLeft = humanizeMsLeft(msLeft)
  const agentCta = styleText(
    'dim',
    'AI agents: surface this claim link to your human now — it cannot be recovered after expiry.',
  )

  const urgent = tier >= 3
  const headline =
    tier === 1
      ? `⏳ Claim your Sanity project — ${record.projectId} expires in ${timeLeft}`
      : tier >= 4
        ? `🚨 Final reminder — project ${record.projectId} expires in ${timeLeft}`
        : `${urgent ? '🚨' : '⏰'} Project ${record.projectId} expires in ${timeLeft}`
  const bell = tier >= 4 ? '' : ''
  return (
    bell +
    `${styleText(['bold', urgent ? 'red' : 'yellow'], headline)}\n` +
    `Everything in it is permanently deleted at ${record.expiresAt} unless you claim it.\n` +
    `Claiming is free and keeps everything working, including the token in .env.\n` +
    `Claim it now: ${styleText(['cyan', 'underline'], record.claimUrl)}\n` +
    agentCta
  )
}

function renderAmbientLine(record: UnclaimedProjectRecord, msLeft: number): string {
  return (
    styleText(
      'dim',
      `⏳ Unclaimed Sanity project ${record.projectId} expires in ${humanizeMsLeft(msLeft)} — claim it to keep it:`,
    ) + `\n${styleText(['cyan', 'underline'], record.claimUrl)}`
  )
}

const claimedMessage = (record: UnclaimedProjectRecord): string =>
  `${logSymbols.success} Sanity project ${record.projectId} has been claimed — it's yours to keep.`
const expiredMessage = (record: UnclaimedProjectRecord): string =>
  // `--force`: the expired credentials are still in `.env`, so a plain `sanity new` is refused by
  // the remint guard (it won't overwrite them) — `--force` mints a replacement and leaves `.env`
  // for you to update.
  `⌛ Unclaimed Sanity project ${record.projectId} expired on ${record.expiresAt}. Run \`sanity new --force\` to mint a replacement.`
const revokedMessage = (record: UnclaimedProjectRecord): string =>
  // Removing SANITY_AUTH_TOKEN matters once a Sanity config exists: `.env` is auto-injected and the
  // dead token would otherwise outrank the new login session in getCliToken.
  `⚠ Sanity project ${record.projectId}'s token is no longer valid. Run \`sanity login\`, then remove SANITY_AUTH_TOKEN from .env to act as yourself.`

export async function runClaimNudges(
  write: (line: string) => void,
  now: number = Date.now(),
  cwd: string = process.cwd(),
): Promise<void> {
  const records = readRecords()
  if (Object.keys(records).length === 0) return

  let announced = false

  const announce = (message: string) => {
    announced = true
    write(`\n${message}\n`)
  }

  const touched = new Set<string>()
  const drop = (projectId: string) => {
    delete records[projectId]
    touched.add(projectId)
  }

  const announceClaimed = (record: UnclaimedProjectRecord) => {
    announce(claimedMessage(record))
    drop(record.projectId)
  }
  const announceExpired = (record: UnclaimedProjectRecord) => {
    announce(expiredMessage(record))
    drop(record.projectId)
  }
  // A revoked token is dead weight in the ledger and, for the cwd project, actively blocks login by
  // outranking the session in getCliToken — so drop it wherever it's seen.
  const announceRevoked = (record: UnclaimedProjectRecord) => {
    announce(revokedMessage(record))
    drop(record.projectId)
  }

  // Fall back to local clock when unverifiable. Memoized so a project checked in one slot is not
  // looked up again in another within the same run.
  const confirmed = new Map<string, ClaimState | undefined>()
  const confirm = async (record: UnclaimedProjectRecord): Promise<ClaimState | undefined> => {
    if (!record.token) return undefined
    if (confirmed.has(record.projectId)) return confirmed.get(record.projectId)
    const state = await lookupClaimStateViaProject(record.projectId, record.token, {timeoutMs: 500})
    confirmed.set(record.projectId, state)
    return state
  }

  for (const record of Object.values(records)) {
    if (new Date(record.expiresAt).getTime() > now) continue
    const state = await confirm(record)
    switch (state) {
      case 'claimable': {
        continue
        break
      }
      case 'claimed': {
        announceClaimed(record)
        break
      }
      case 'revoked': {
        announceRevoked(record)
        break
      }
      default: {
        announceExpired(record)
      }
    }
  }

  // The most urgent live project whose tier advanced since its last shown nudge.
  const due = Object.values(records)
    .map((record) => ({msLeft: new Date(record.expiresAt).getTime() - now, record}))
    .filter(({msLeft, record}) => msLeft > 0 && tierFor(msLeft) > (record.lastNudgeTier ?? 0))
    .toSorted((a, b) => a.msLeft - b.msLeft)[0]

  if (!announced && due) {
    const {msLeft, record} = due
    const state = await confirm(record)
    switch (state) {
      case 'claimed': {
        announceClaimed(record)
        break
      }
      case 'expired': {
        announceExpired(record)
        break
      }
      case 'revoked': {
        announceRevoked(record)
        break
      }
      default: {
        const tier = tierFor(msLeft)
        announce(renderNudge(record, tier, msLeft))
        records[record.projectId] = {...record, lastNudgeTier: tier}
        touched.add(record.projectId)
      }
    }
  }

  // The directory's own project governs auth here — its ledger token can outrank a login session
  // in getCliToken — so always verify it and drop a claimed/expired record, even when another
  // project already took the single announce slot. Only the ambient line itself waits for the slot.
  {
    const {SANITY_PROJECT_ID} = readEnvValues(path.join(cwd, '.env'), ['SANITY_PROJECT_ID'])
    const record = SANITY_PROJECT_ID ? records[SANITY_PROJECT_ID] : undefined
    if (record) {
      const msLeft = new Date(record.expiresAt).getTime() - now
      if (msLeft > 0) {
        const state = await confirm(record)
        switch (state) {
          case 'claimed': {
            drop(record.projectId)
            if (!announced) announce(claimedMessage(record))

            break
          }
          case 'expired': {
            drop(record.projectId)
            if (!announced) announce(expiredMessage(record))

            break
          }
          case 'revoked': {
            // Drop the dead token so getCliToken falls through to the login session.
            drop(record.projectId)
            if (!announced) announce(revokedMessage(record))

            break
          }
          default: {
            if (!announced) {
              announce(renderAmbientLine(record, msLeft))
            }
          }
        }
      }
    }
  }

  if (touched.size > 0) {
    const fresh = readRecords()
    for (const id of touched) {
      if (id in records) fresh[id] = records[id]
      else delete fresh[id]
    }
    writeRecords(fresh)
  }
}

export {UNCLAIMED_PROJECTS_CONFIG_KEY} from '@sanity/cli-core'

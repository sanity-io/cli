import {styleText} from 'node:util'

import {getUserConfig} from '@sanity/cli-core'
import {subdebug} from '@sanity/cli-core/debug'
import {logSymbols} from '@sanity/cli-core/ux'

import {lookupClaimState, type MintedProject} from '../services/mintProject.js'

const debug = subdebug('claimNudges')

/** User config key holding minted-but-unclaimed projects, keyed by project id. */
export const UNCLAIMED_PROJECTS_CONFIG_KEY = 'unclaimedProjects'

export interface UnclaimedProjectRecord {
  claimToken: string
  claimUrl: string
  expiresAt: string
  mintedAt: string
  projectId: string

  /** Highest nudge tier already shown for this project — each tier fires at most once. */
  lastNudgeTier?: number
}

/**
 * The nudge waterfall: each tier activates when remaining time drops below its threshold, fires
 * at most once per project, and escalates in visual weight. At most one nudge is shown per CLI
 * invocation, so a project produces a maximum of four reminders across its 72-hour window.
 */
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
  // The registry is user-editable state: a hand-edited or corrupted entry must never take down
  // the whole nudge pass (the renderer's crash would be swallowed by the never-throw hook,
  // silencing every reminder). This is the single validation boundary — consumers key every
  // mutation by `record.projectId`, so an entry whose map key disagrees with its record is as
  // unusable as one missing a field (deletes would no-op, farewells would repeat). Entries that
  // fail either check are invisible to all consumers; they stay in the config untouched unless
  // a reminder outcome triggers a rewrite.
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
 * Persist a freshly minted project so later CLI invocations can nudge toward claiming it.
 * Failures are swallowed — a config write must never fail the mint itself.
 */
export function recordMintedProject(minted: MintedProject): void {
  try {
    const records = readRecords()
    records[minted.resourceId] = {
      claimToken: minted.claimToken,
      claimUrl: minted.claimUrl,
      expiresAt: minted.expiresAt,
      mintedAt: new Date().toISOString(),
      projectId: minted.resourceId,
    }
    writeRecords(records)
  } catch (err) {
    debug('failed to record minted project: %s', err)
  }
}

/**
 * Compact line rendering, deliberately not a box: developers ad-blind banner boxes the way they
 * gloss over sponsored search results, and a reminder that gets skimmed past protects nothing.
 * Tiers escalate through color and copy in a constant three-line footprint (plus the agent CTA).
 */
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
  const body =
    tier === 1
      ? `It is deleted at ${record.expiresAt} unless claimed. Claiming is free and keeps everything.`
      : tier === 2
        ? `After ${record.expiresAt}, the project and everything in it is deleted. Claiming is free and keeps everything.`
        : `All content, schema, and tokens in this project are permanently deleted at ${record.expiresAt}. Claiming is free and keeps everything.`
  const bell = tier >= 4 ? '\u0007' : ''
  return (
    bell +
    `${styleText(['bold', urgent ? 'red' : 'yellow'], headline)}\n` +
    `${body}\n` +
    `Claim it now: ${styleText('cyan', record.claimUrl)}\n` +
    agentCta
  )
}

/**
 * Check the registry of minted-but-unclaimed projects and emit at most one reminder for the most
 * urgent project whose nudge tier has advanced since it was last shown. Called from the prerun
 * hook on every CLI invocation; must never throw and stays network-free unless a nudge is due.
 *
 * Before nudging, the claim state is verified against the provision API (fail-open on network
 * errors): claimed projects get a one-time confirmation and are dropped from the registry,
 * expired projects get a one-time notice and are dropped as well.
 */
export async function runClaimNudges(
  write: (line: string) => void,
  now: number = Date.now(),
): Promise<void> {
  const records = readRecords()
  const all = Object.values(records)
  if (all.length === 0) return

  // Blank-line padding around every announcement so it never sits flush against the output of
  // the command it rides along with.
  const announce = (message: string) => write(`\n${message}\n`)

  let dirty = false
  // Ids this pass changed — the final write merges exactly these over a fresh read, so records
  // written by another process while this pass awaited a lookup are never clobbered.
  const touched = new Set<string>()

  // Locally expired projects: verify against the API before the farewell — the user may have
  // claimed since the last run, and announcing a claimed project as "expired" is worse than no
  // reminder at all. A server that still says claimable (clock skew, an extended window)
  // refreshes the local expiry instead of dropping a live record; lookup failure fails open to
  // the local clock. Each record reaches this branch at most once per outcome, so the lookup
  // cost stays bounded.
  for (const record of all) {
    if (new Date(record.expiresAt).getTime() - now > 0) continue
    const lookup = await lookupClaimState(record.claimToken)
    if (lookup?.state === 'claimed') {
      announce(
        `${logSymbols.success} Sanity project ${record.projectId} has been claimed — it's yours to keep.`,
      )
      delete records[record.projectId]
      touched.add(record.projectId)
      dirty = true
    } else if (lookup?.state === 'claimable') {
      if (lookup.expiresAt) {
        records[record.projectId] = {...record, expiresAt: lookup.expiresAt}
        touched.add(record.projectId)
        dirty = true
      }
      // No expiry from the server: keep the record untouched; the next run re-checks.
    } else {
      announce(
        `⌛ Unclaimed Sanity project ${record.projectId} expired on ${record.expiresAt}. Run \`sanity new\` to mint a new one — where old credentials remain in .env, the guard will walk you through it.`,
      )
      delete records[record.projectId]
      touched.add(record.projectId)
      dirty = true
    }
  }

  // Most urgent live project whose tier advanced since the last shown nudge. `msLeft > 0` keeps
  // lapsed records out of this path entirely — they belong to the farewell loop above, and a
  // lapsed-but-kept record must never render as a bogus "expires in about 1 minutes" finale.
  const due = Object.values(records)
    .map((record) => ({msLeft: new Date(record.expiresAt).getTime() - now, record}))
    .filter(({msLeft, record}) => msLeft > 0 && tierFor(msLeft) > (record.lastNudgeTier ?? 0))
    .toSorted((a, b) => a.msLeft - b.msLeft)[0]

  if (due) {
    const {record} = due
    const lookup = await lookupClaimState(record.claimToken)

    if (lookup?.state === 'claimed') {
      announce(
        `${logSymbols.success} Sanity project ${record.projectId} has been claimed — it's yours to keep.`,
      )
      delete records[record.projectId]
      touched.add(record.projectId)
      dirty = true
    } else if (lookup?.state === 'expired') {
      announce(
        `⌛ Unclaimed Sanity project ${record.projectId} has expired. Run \`sanity new\` to mint a new one — where old credentials remain in .env, the guard will walk you through it.`,
      )
      delete records[record.projectId]
      touched.add(record.projectId)
      dirty = true
    } else {
      // Claimable — or lookup failed, in which case we fail open on local expiry data. When the
      // server supplied a fresh expiry (window extended or shortened), trust it over the local
      // copy: refresh the record and recompute urgency, skipping the nudge if it turns out no
      // longer due at the corrected deadline.
      const expiresAt = lookup?.expiresAt ?? record.expiresAt
      const msLeft = new Date(expiresAt).getTime() - now
      const tier = tierFor(msLeft)
      const refreshed = {...record, expiresAt}
      if (msLeft > 0 && tier > (record.lastNudgeTier ?? 0)) {
        announce(renderNudge(refreshed, tier, msLeft))
        records[record.projectId] = {...refreshed, lastNudgeTier: tier}
      } else {
        records[record.projectId] = refreshed
      }
      touched.add(record.projectId)
      dirty = true
    }
  }

  if (dirty) {
    // Merge over a fresh read rather than writing the whole snapshot back: this pass may have
    // awaited claim-state lookups for seconds, and a record minted (or updated) by another
    // process in that window must survive — only the ids this pass touched move.
    const fresh = readRecords()
    for (const id of touched) {
      if (id in records) {
        fresh[id] = records[id]
      } else {
        delete fresh[id]
      }
    }
    writeRecords(fresh)
  }
}

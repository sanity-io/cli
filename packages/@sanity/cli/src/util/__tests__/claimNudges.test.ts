import {getUserConfig} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {lookupClaimState} from '../../services/mintProject.js'
import {
  recordMintedProject,
  runClaimNudges,
  UNCLAIMED_PROJECTS_CONFIG_KEY,
  type UnclaimedProjectRecord,
} from '../claimNudges.js'

vi.mock(import('@sanity/cli-core'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getUserConfig: vi.fn(),
  }
})
vi.mock('../../services/mintProject.js', () => ({
  lookupClaimState: vi.fn(),
}))

const mockGetUserConfig = vi.mocked(getUserConfig)
const mockLookupClaimState = vi.mocked(lookupClaimState)

const HOUR = 3_600_000
const NOW = new Date('2026-07-15T12:00:00.000Z').getTime()

let store: Record<string, unknown> = {}

function seedRecord(overrides: Partial<UnclaimedProjectRecord> = {}): UnclaimedProjectRecord {
  const record: UnclaimedProjectRecord = {
    claimToken: 'claim-token',
    claimUrl: 'https://www.sanity.io/claim/some-token',
    expiresAt: new Date(NOW + 47 * HOUR).toISOString(),
    mintedAt: new Date(NOW - HOUR).toISOString(),
    projectId: 'abc123',
    ...overrides,
  }
  const records = (store[UNCLAIMED_PROJECTS_CONFIG_KEY] ?? {}) as Record<string, unknown>
  store[UNCLAIMED_PROJECTS_CONFIG_KEY] = {...records, [record.projectId]: record}
  return record
}

function storedRecords(): Record<string, UnclaimedProjectRecord> {
  return (store[UNCLAIMED_PROJECTS_CONFIG_KEY] ?? {}) as Record<string, UnclaimedProjectRecord>
}

async function run(now = NOW): Promise<string> {
  const write = vi.fn()
  await runClaimNudges(write, now)
  return write.mock.calls.map(([line]) => String(line)).join('\n')
}

beforeEach(() => {
  store = {}
  mockGetUserConfig.mockReturnValue({
    delete: (key: string) => {
      delete store[key]
    },
    get: (key: string) => store[key],
    set: (key: string, value: unknown) => {
      store[key] = value
    },
  })
  mockLookupClaimState.mockResolvedValue({
    expiresAt: new Date(NOW + 47 * HOUR).toISOString(),
    state: 'claimable',
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#recordMintedProject', () => {
  test('persists the minted project to the registry', () => {
    recordMintedProject({
      apiHost: 'https://abc123.api.sanity.io',
      claimApiUrl: 'https://api.sanity.io/v1/provision/claim',
      claimToken: 'claim-token',
      claimUrl: 'https://www.sanity.io/claim/some-token',
      datasetName: 'production',
      expiresAt: '2026-07-18T12:00:00.000Z',
      resourceId: 'abc123',
      token: 'sk-robot',
    })

    expect(storedRecords().abc123).toMatchObject({
      claimToken: 'claim-token',
      claimUrl: 'https://www.sanity.io/claim/some-token',
      expiresAt: '2026-07-18T12:00:00.000Z',
      projectId: 'abc123',
    })
  })

  test('swallows config write failures', () => {
    mockGetUserConfig.mockImplementation(() => {
      throw new Error('disk full')
    })

    expect(() =>
      recordMintedProject({
        apiHost: 'x',
        claimApiUrl: 'x',
        claimToken: 'x',
        claimUrl: 'x',
        datasetName: 'x',
        expiresAt: 'x',
        resourceId: 'x',
        token: 'x',
      }),
    ).not.toThrow()
  })
})

describe('#runClaimNudges', () => {
  test('a malformed registry entry never silences reminders for healthy projects', async () => {
    // The registry is user-editable state (UAT helpers, hand edits). A half-broken entry —
    // e.g. an expiresAt with no claimUrl/claimToken — must be invisible, not crash the pass:
    // the never-throw hook would swallow the crash and silence every reminder.
    const records = (store[UNCLAIMED_PROJECTS_CONFIG_KEY] ?? {}) as Record<string, unknown>
    const mismatched = seedRecord({projectId: 'zzz999'}) // full record, then re-keyed wrong:
    store[UNCLAIMED_PROJECTS_CONFIG_KEY] = {
      ...records,
      phantom: {expiresAt: new Date(NOW + 2 * HOUR).toISOString()},
      wrongkey: {...mismatched},
    }
    delete (store[UNCLAIMED_PROJECTS_CONFIG_KEY] as Record<string, unknown>).zzz999
    seedRecord({expiresAt: new Date(NOW + 47 * HOUR).toISOString()})

    const output = await run()

    expect(output).toContain('⏳ Claim your Sanity project — abc123')
    expect(output).not.toContain('phantom')
    expect(output).not.toContain('zzz999')
    expect(storedRecords().abc123.lastNudgeTier).toBe(1)
    // The write that recorded the healthy nudge persists the filtered view — the malformed and
    // mis-keyed entries are dropped rather than resurrected (self-healing; consumers key every
    // mutation by projectId, so a mismatched entry could only ever repeat farewells).
    expect(storedRecords().phantom).toBeUndefined()
    expect(storedRecords().wrongkey).toBeUndefined()
  })

  test('a mint landing during the lookup window survives the registry write', async () => {
    // The pass snapshots the registry, then awaits claim-state lookups for up to seconds. A
    // record written by another process in that window (most damagingly `sanity new` finishing
    // a mint) must not be clobbered when the pass persists its own outcome.
    seedRecord({expiresAt: new Date(NOW + 47 * HOUR).toISOString()})
    mockLookupClaimState.mockImplementation(async () => {
      const records = (store[UNCLAIMED_PROJECTS_CONFIG_KEY] ?? {}) as Record<string, unknown>
      store[UNCLAIMED_PROJECTS_CONFIG_KEY] = {
        ...records,
        fresh99: {
          claimToken: 'fresh-token',
          claimUrl: 'https://www.sanity.io/claim/fresh-token',
          expiresAt: new Date(NOW + 71 * HOUR).toISOString(),
          mintedAt: new Date(NOW).toISOString(),
          projectId: 'fresh99',
        },
      }
      return {expiresAt: new Date(NOW + 47 * HOUR).toISOString(), state: 'claimable'}
    })

    const output = await run()

    expect(output).toContain('⏳ Claim your Sanity project — abc123')
    // The pass's own outcome persisted…
    expect(storedRecords().abc123.lastNudgeTier).toBe(1)
    // …and the concurrent mint's record survived the write.
    expect(storedRecords().fresh99).toBeDefined()
  })

  test('does nothing when the registry is empty', async () => {
    expect(await run()).toBe('')
    expect(mockLookupClaimState).not.toHaveBeenCalled()
  })

  test('stays quiet with more than 48 hours remaining', async () => {
    seedRecord({expiresAt: new Date(NOW + 60 * HOUR).toISOString()})

    expect(await run()).toBe('')
    expect(mockLookupClaimState).not.toHaveBeenCalled()
  })

  test('tier 1 fires under 48 hours and is shown only once', async () => {
    seedRecord({expiresAt: new Date(NOW + 47 * HOUR).toISOString()})

    const first = await run()
    expect(first).toContain('⏳ Claim your Sanity project')
    expect(first).toContain('abc123')
    expect(first).toContain('expires in about 47 hours')
    expect(first).toContain('https://www.sanity.io/claim/some-token')
    expect(first).not.toContain('╭') // compact lines, never a box
    expect(storedRecords().abc123.lastNudgeTier).toBe(1)

    expect(await run()).toBe('')
    expect(mockLookupClaimState).toHaveBeenCalledTimes(1)
  })

  test('escalates through tiers as the deadline approaches', async () => {
    seedRecord({expiresAt: new Date(NOW + 47 * HOUR).toISOString(), lastNudgeTier: 1})

    const tier2 = await run(NOW + 24 * HOUR)
    expect(tier2).toContain('⏰ Project abc123 expires in about 23 hours')
    expect(storedRecords().abc123.lastNudgeTier).toBe(2)

    const tier3 = await run(NOW + 40 * HOUR)
    expect(tier3).toContain('🚨 Project abc123 expires in about 7 hours')
    expect(storedRecords().abc123.lastNudgeTier).toBe(3)

    const tier4 = await run(NOW + 45.5 * HOUR)
    expect(tier4).toContain('🚨 Final reminder')
    expect(tier4).toContain('about 90 minutes')
    expect(storedRecords().abc123.lastNudgeTier).toBe(4)

    expect(await run(NOW + 46 * HOUR)).toBe('')
  })

  test('tier nudges include the agent call-to-action', async () => {
    seedRecord({expiresAt: new Date(NOW + 23 * HOUR).toISOString()})

    expect(await run()).toContain('AI agents: surface this claim link to your human now')
  })

  test('confirms and forgets a claimed project instead of nudging', async () => {
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'claimed'})
    seedRecord({expiresAt: new Date(NOW + 23 * HOUR).toISOString()})

    const output = await run()

    expect(output).toContain('has been claimed')
    expect(storedRecords().abc123).toBeUndefined()
  })

  test('notes and forgets a remotely expired project', async () => {
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'expired'})
    seedRecord({expiresAt: new Date(NOW + 23 * HOUR).toISOString()})

    const output = await run()

    expect(output).toContain('⌛ Unclaimed Sanity project abc123 has expired')
    expect(output).toContain('Run `sanity new` to mint a new one')
    expect(output).not.toContain('reclaimed')
    expect(storedRecords().abc123).toBeUndefined()
  })

  test('fails open when the lookup is unavailable', async () => {
    mockLookupClaimState.mockResolvedValue(undefined)
    seedRecord({expiresAt: new Date(NOW + 23 * HOUR).toISOString()})

    expect(await run()).toContain('⏰ Project abc123 expires in about 23 hours')
  })

  test('notifies once about locally expired projects and forgets them (lookup fails open)', async () => {
    mockLookupClaimState.mockResolvedValue(undefined)
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString()})

    const output = await run()

    expect(output).toContain('⌛ Unclaimed Sanity project abc123 expired on')
    expect(output).toContain('Run `sanity new` to mint a new one')
    expect(output).not.toContain('reclaimed')
    expect(storedRecords().abc123).toBeUndefined()
    // The farewell is verified first — never announced from the local clock alone.
    expect(mockLookupClaimState).toHaveBeenCalledWith('claim-token')

    expect(await run()).toBe('')
  })

  test('locally expired but actually claimed: congratulates instead of the expiry notice', async () => {
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'claimed'})
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString()})

    const output = await run()

    expect(output).toContain('has been claimed')
    expect(output).not.toContain('expired on')
    expect(storedRecords().abc123).toBeUndefined()
  })

  test('locally expired but server says claimable: refreshes the expiry, keeps the record', async () => {
    const serverExpiry = new Date(NOW + 12 * HOUR).toISOString()
    mockLookupClaimState.mockResolvedValue({expiresAt: serverExpiry, state: 'claimable'})
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString()})

    const output = await run()

    expect(output).not.toContain('expired on')
    expect(storedRecords().abc123.expiresAt).toBe(serverExpiry)
  })

  test('renders the nudge from the server expiry when the window changed', async () => {
    // Local copy says 47h (tier 1 due); server says 23h — the countdown must not lie.
    seedRecord({expiresAt: new Date(NOW + 47 * HOUR).toISOString()})
    mockLookupClaimState.mockResolvedValue({
      expiresAt: new Date(NOW + 23 * HOUR).toISOString(),
      state: 'claimable',
    })

    const output = await run()

    expect(output).toContain('expires in about 23 hours')
    expect(storedRecords().abc123.expiresAt).toBe(new Date(NOW + 23 * HOUR).toISOString())
    expect(storedRecords().abc123.lastNudgeTier).toBe(2)
  })

  test('skips the nudge when the server-extended window means none is due', async () => {
    seedRecord({expiresAt: new Date(NOW + 47 * HOUR).toISOString()})
    mockLookupClaimState.mockResolvedValue({
      expiresAt: new Date(NOW + 60 * HOUR).toISOString(),
      state: 'claimable',
    })

    const output = await run()

    expect(output).toBe('')
    expect(storedRecords().abc123.expiresAt).toBe(new Date(NOW + 60 * HOUR).toISOString())
    expect(storedRecords().abc123.lastNudgeTier).toBeUndefined()
  })

  test('a lapsed-but-claimable record never renders a bogus final reminder', async () => {
    // Farewell keeps the record (server says claimable, no fresh expiry) — the due path must
    // not pick up its non-positive countdown and bell out "expires in about 1 minutes".
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'claimable'})
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString()})

    const output = await run()

    expect(output).toBe('')
    expect(storedRecords().abc123).toBeDefined()
  })

  test('nudges only the most urgent project per invocation', async () => {
    // Server agrees with the local expiry, so the tier comes out of the 5h countdown.
    mockLookupClaimState.mockResolvedValue({
      expiresAt: new Date(NOW + 5 * HOUR).toISOString(),
      state: 'claimable',
    })
    seedRecord({expiresAt: new Date(NOW + 40 * HOUR).toISOString(), projectId: 'later00'})
    seedRecord({expiresAt: new Date(NOW + 5 * HOUR).toISOString(), projectId: 'sooner0'})

    const output = await run()

    expect(output).toContain('sooner0')
    expect(output).not.toContain('later00')
    expect(storedRecords().sooner0.lastNudgeTier).toBe(3)
    expect(storedRecords().later00.lastNudgeTier).toBeUndefined()
  })
})

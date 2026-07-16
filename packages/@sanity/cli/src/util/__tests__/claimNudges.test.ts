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
    expect(first).toContain('╭') // boxed, like every tier
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

  test('boxed tiers include the agent call-to-action', async () => {
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

  test('notifies once about locally expired projects and forgets them', async () => {
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString()})

    const output = await run()

    expect(output).toContain('⌛ Unclaimed Sanity project abc123 expired on')
    expect(output).toContain('Run `sanity new` to mint a new one')
    expect(output).not.toContain('reclaimed')
    expect(storedRecords().abc123).toBeUndefined()
    expect(mockLookupClaimState).not.toHaveBeenCalled()

    expect(await run()).toBe('')
  })

  test('nudges only the most urgent project per invocation', async () => {
    seedRecord({expiresAt: new Date(NOW + 40 * HOUR).toISOString(), projectId: 'later00'})
    seedRecord({expiresAt: new Date(NOW + 5 * HOUR).toISOString(), projectId: 'sooner0'})

    const output = await run()

    expect(output).toContain('sooner0')
    expect(output).not.toContain('later00')
    expect(storedRecords().sooner0.lastNudgeTier).toBe(3)
    expect(storedRecords().later00.lastNudgeTier).toBeUndefined()
  })
})

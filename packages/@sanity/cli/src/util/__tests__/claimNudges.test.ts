import {getUserConfig} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {lookupClaimStateViaProject} from '../../services/mintProject.js'
import {
  forgetMintedProject,
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
  lookupClaimStateViaProject: vi.fn(),
}))

const mockGetUserConfig = vi.mocked(getUserConfig)
const mockLookupViaProject = vi.mocked(lookupClaimStateViaProject)

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
    token: 'sk-robot',
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
  // Live per the org read unless a test says otherwise.
  mockLookupViaProject.mockResolvedValue('claimable')
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#recordMintedProject', () => {
  test('persists the minted project to the registry, token included', () => {
    const ok = recordMintedProject({
      apiHost: 'https://abc123.api.sanity.io',
      claimApiUrl: 'https://api.sanity.io/v1/provision/claim',
      claimToken: 'claim-token',
      claimUrl: 'https://www.sanity.io/claim/some-token',
      datasetName: 'production',
      expiresAt: '2026-07-18T12:00:00.000Z',
      resourceId: 'abc123',
      token: 'sk-robot',
    })

    expect(ok).toBe(true)
    expect(storedRecords().abc123).toMatchObject({
      claimToken: 'claim-token',
      claimUrl: 'https://www.sanity.io/claim/some-token',
      expiresAt: '2026-07-18T12:00:00.000Z',
      projectId: 'abc123',
      token: 'sk-robot',
    })
  })

  test('returns false (without throwing) on a config write failure', () => {
    mockGetUserConfig.mockImplementation(() => {
      throw new Error('disk full')
    })

    let result: boolean | undefined
    expect(() => {
      result = recordMintedProject({
        apiHost: 'x',
        claimApiUrl: 'x',
        claimToken: 'x',
        claimUrl: 'x',
        datasetName: 'x',
        expiresAt: 'x',
        resourceId: 'x',
        token: 'x',
      })
    }).not.toThrow()
    expect(result).toBe(false)
  })
})

describe('#forgetMintedProject', () => {
  test('reports success, including when the record is already gone', () => {
    seedRecord()

    expect(forgetMintedProject('abc123')).toBe(true)
    expect(storedRecords().abc123).toBeUndefined()
    expect(forgetMintedProject('abc123')).toBe(true)
  })

  test('reports failure on an unwritable config, so callers can surface it', () => {
    seedRecord()
    mockGetUserConfig.mockReturnValue({
      delete: () => {
        throw new Error('EACCES: permission denied')
      },
      get: (key: string) => store[key],
      set: () => {
        throw new Error('EACCES: permission denied')
      },
    } as never)

    expect(forgetMintedProject('abc123')).toBe(false)
  })
})

describe('#runClaimNudges', () => {
  test('does nothing when the registry is empty', async () => {
    expect(await run()).toBe('')
    expect(mockLookupViaProject).not.toHaveBeenCalled()
  })

  test('reminds on every run, from the moment of mint to the end', async () => {
    seedRecord({expiresAt: new Date(NOW + 71 * HOUR).toISOString()})

    const first = await run()
    expect(first).toContain('Unclaimed Sanity project abc123 expires in 71 hours')
    expect(first).toContain(
      "Claim it now: there's no downside to claiming early, and everything keeps working, including the token in .env.",
    )
    expect(first).toContain('https://www.sanity.io/claim/some-token')
    expect(first).toContain('permanently deleted at')
    expect(first).toContain('If an agent is running this, surface the full claim URL to the user.')
    expect(first).toContain('They need to click this link to claim the project before it expires.')
    expect(first).not.toContain('╭') // compact lines, never a box
    expect(first.startsWith('\n')).toBe(true)
    // No dedupe: the identical reminder repeats on the very next run.
    expect(await run()).toBe(first)
  })

  test('the countdown tracks the clock exactly, with constant copy', async () => {
    seedRecord({expiresAt: new Date(NOW + 47 * HOUR).toISOString()})

    expect(await run()).toContain('expires in 47 hours')
    expect(await run(NOW + 24 * HOUR)).toContain('expires in 23 hours')

    const closeToDeadline = await run(NOW + 45.5 * HOUR)
    expect(closeToDeadline).toContain('expires in 1 hour 30 minutes')
    expect(closeToDeadline).not.toContain('Final reminder')
    expect(closeToDeadline).toContain(
      "Claim it now: there's no downside to claiming early, and everything keeps working, including the token in .env.",
    )
  })

  test('verifies every render through the project host with the ledger token', async () => {
    seedRecord()

    await run()

    expect(mockLookupViaProject).toHaveBeenCalledWith('abc123', 'sk-robot')
  })

  test('a record with no token reminds off the local clock alone', async () => {
    seedRecord({token: undefined})

    expect(await run()).toContain('Unclaimed Sanity project abc123 expires in 47 hours')
    // No token means no org read to attempt.
    expect(mockLookupViaProject).not.toHaveBeenCalled()
  })

  test('aggregates multiple projects: full block for the soonest, one line each for the rest', async () => {
    seedRecord({expiresAt: new Date(NOW + 47 * HOUR).toISOString()})
    seedRecord({
      claimUrl: 'https://www.sanity.io/claim/def-token',
      expiresAt: new Date(NOW + 20 * HOUR).toISOString(),
      projectId: 'def456',
    })

    const output = await run()

    // The soonest-to-expire project leads with headline, CTA, and URL only: the aggregate block
    // takes over where the solo deletion line would sit.
    expect(output).toContain('Unclaimed Sanity project def456 expires in 20 hours')
    expect(output).not.toContain('Everything in it is permanently deleted at')
    // The rest aggregate to a header plus one compact line per project, claim URL included.
    expect(output).toContain(
      '1 more unclaimed Sanity project, permanently deleted at its deadline unless you claim it:',
    )
    expect(output).toContain('abc123 expires in 47 hours: https://www.sanity.io/claim/some-token')
    expect(output).not.toContain('Unclaimed Sanity project abc123 expires')
    // The agent instruction appears once, on the aggregate, covering every link above it.
    expect(output).toContain(
      'If an agent is running this, surface every claim URL above to the user.',
    )
    expect(output).toContain('They need to click each link to claim its project before it expires.')
    expect(output).not.toContain('surface the full claim URL to the user.')
  })

  test('pluralizes the aggregation header past two projects', async () => {
    seedRecord()
    seedRecord({expiresAt: new Date(NOW + 20 * HOUR).toISOString(), projectId: 'def456'})
    seedRecord({expiresAt: new Date(NOW + 30 * HOUR).toISOString(), projectId: 'ghi789'})

    const output = await run()

    expect(output).toContain(
      '2 more unclaimed Sanity projects, each permanently deleted at its deadline unless you claim it:',
    )
    expect(output).toContain('ghi789 expires in 30 hours:')
    expect(output).toContain('abc123 expires in 47 hours:')
  })

  test('a malformed registry entry never silences reminders for healthy projects', async () => {
    const records = (store[UNCLAIMED_PROJECTS_CONFIG_KEY] ?? {}) as Record<string, unknown>
    const mismatched = seedRecord({projectId: 'zzz999'})
    store[UNCLAIMED_PROJECTS_CONFIG_KEY] = {
      ...records,
      phantom: {expiresAt: new Date(NOW + 2 * HOUR).toISOString()},
      wrongkey: {...mismatched},
    }
    delete (store[UNCLAIMED_PROJECTS_CONFIG_KEY] as Record<string, unknown>).zzz999
    seedRecord()

    const output = await run()

    expect(output).toContain('Unclaimed Sanity project abc123 expires')
    expect(output).not.toContain('phantom')
    expect(output).not.toContain('zzz999')
  })

  test('confirms and forgets a claimed project instead of reminding', async () => {
    mockLookupViaProject.mockResolvedValue('claimed')
    seedRecord()

    const output = await run()

    expect(output).toContain('has been claimed')
    // The robot token in .env keeps outranking a login session; the farewell must say so.
    expect(output).toContain('still authenticate with the robot token')
    expect(output).toContain('remove SANITY_AUTH_TOKEN from ./.env or sanity/.env.local')
    expect(output).not.toContain('Claim it now:')
    expect(storedRecords().abc123).toBeUndefined()
    expect(await run()).toBe('')
  })

  test('post-claim cleanup names every file a token can reach, not just .env', async () => {
    mockLookupViaProject.mockResolvedValue('claimed')
    seedRecord()

    const output = await run()

    expect(output).toContain('./.env or sanity/.env.local')
    expect(output).not.toMatch(/SANITY_AUTH_TOKEN from \.env\b/)
  })

  test('drops a revoked token so login can take over', async () => {
    mockLookupViaProject.mockResolvedValue('revoked')
    seedRecord()

    const output = await run()

    expect(output).toContain('token is no longer valid')
    expect(output).toContain('sanity login')
    // A config dir auto-injects .env, so the dead token must be removed or it outranks the session.
    expect(output).toContain('remove SANITY_AUTH_TOKEN from ./.env')
    expect(storedRecords().abc123).toBeUndefined()
    expect(await run()).toBe('')
  })

  test('announces server-confirmed expiry and forgets the project', async () => {
    mockLookupViaProject.mockResolvedValue('expired')
    seedRecord()

    const output = await run()

    expect(output).toContain('Unclaimed Sanity project abc123 expired on')
    expect(output).toContain('Run `sanity new --force` to mint a replacement')
    expect(storedRecords().abc123).toBeUndefined()
    expect(await run()).toBe('')
  })

  test('notifies once about locally expired projects and forgets them (org read fails open)', async () => {
    mockLookupViaProject.mockResolvedValue(undefined)
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString()})

    const output = await run()

    expect(output).toContain('Unclaimed Sanity project abc123 expired on')
    expect(output).toContain('Run `sanity new --force` to mint a replacement')
    expect(storedRecords().abc123).toBeUndefined()
    expect(await run()).toBe('')
  })

  test('a locally expired project the server still calls claimable is kept quietly', async () => {
    // Clock skew or an extended window: the org read is the authority, so no farewell fires and
    // the record survives for the next run to re-check.
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString()})

    expect(await run()).toBe('')
    expect(storedRecords().abc123).toBeDefined()
  })

  test('a mint landing during the lookup window survives the registry write', async () => {
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString()})
    mockLookupViaProject.mockImplementation(async () => {
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
      return 'expired'
    })

    const output = await run()

    expect(output).toContain('Unclaimed Sanity project abc123 expired on')
    // The expiry farewell dropped abc123, but the concurrent mint's record survived the write.
    expect(storedRecords().abc123).toBeUndefined()
    expect(storedRecords().fresh99).toBeDefined()
  })
})

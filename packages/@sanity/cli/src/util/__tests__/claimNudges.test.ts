import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

/** Default cwd has no .env, so the ambient line stays out of waterfall-focused tests. */
async function run(now = NOW, cwd = '/nonexistent-claim-nudges-cwd'): Promise<string> {
  const write = vi.fn()
  await runClaimNudges(write, now, cwd)
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
  test('a malformed registry entry never silences reminders for healthy projects', async () => {
    const records = (store[UNCLAIMED_PROJECTS_CONFIG_KEY] ?? {}) as Record<string, unknown>
    const mismatched = seedRecord({projectId: 'zzz999'})
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
    // The write that recorded the healthy nudge persists the filtered view.
    expect(storedRecords().phantom).toBeUndefined()
    expect(storedRecords().wrongkey).toBeUndefined()
  })

  test('a mint landing during the lookup window survives the registry write', async () => {
    seedRecord({expiresAt: new Date(NOW + 47 * HOUR).toISOString()})
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
      return 'claimable'
    })

    const output = await run()

    expect(output).toContain('⏳ Claim your Sanity project — abc123')
    expect(storedRecords().abc123.lastNudgeTier).toBe(1)
    // The concurrent mint's record survived the write.
    expect(storedRecords().fresh99).toBeDefined()
  })

  test('does nothing when the registry is empty', async () => {
    expect(await run()).toBe('')
    expect(mockLookupViaProject).not.toHaveBeenCalled()
  })

  test('stays quiet with more than 48 hours remaining, without touching the network', async () => {
    seedRecord({expiresAt: new Date(NOW + 60 * HOUR).toISOString()})

    expect(await run()).toBe('')
    expect(mockLookupViaProject).not.toHaveBeenCalled()
  })

  test('tier 1 fires under 48 hours and is shown only once', async () => {
    seedRecord({expiresAt: new Date(NOW + 47 * HOUR).toISOString()})

    const first = await run()
    expect(first).toContain('⏳ Claim your Sanity project')
    expect(first).toContain('abc123')
    expect(first).toContain('expires in about 47 hours')
    expect(first).toContain('https://www.sanity.io/claim/some-token')
    expect(first).not.toContain('╭') // compact lines, never a box
    expect(first).toMatch(
      /unless you claim it\.\nClaiming is free and keeps everything working, including the token in \.env\.\nClaim it now:/,
    )
    expect(storedRecords().abc123.lastNudgeTier).toBe(1)

    expect(await run()).toBe('')
    expect(mockLookupViaProject).toHaveBeenCalledTimes(1)
  })

  test('drives tier timing off the local clock (no server round-trip)', async () => {
    seedRecord({expiresAt: new Date(NOW + 47 * HOUR).toISOString()})

    const output = await run()

    expect(output).toContain('expires in about 47 hours')
    // The only network touch is the budget-free org read, with a short abort.
    expect(mockLookupViaProject).toHaveBeenCalledWith('abc123', 'sk-robot', {timeoutMs: 500})
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
    mockLookupViaProject.mockResolvedValue('claimed')
    seedRecord({expiresAt: new Date(NOW + 23 * HOUR).toISOString()})

    const output = await run()

    expect(output).toContain('has been claimed')
    expect(storedRecords().abc123).toBeUndefined()
  })

  test('notes and forgets a project the org read reports gone', async () => {
    mockLookupViaProject.mockResolvedValue('expired')
    seedRecord({expiresAt: new Date(NOW + 23 * HOUR).toISOString()})

    const output = await run()

    expect(output).toContain('⌛ Unclaimed Sanity project abc123 expired on')
    expect(output).toContain('Run `sanity new --force` to mint a replacement')
    expect(storedRecords().abc123).toBeUndefined()
  })

  test('fails open to the local clock when the org read is unavailable', async () => {
    mockLookupViaProject.mockResolvedValue(undefined)
    seedRecord({expiresAt: new Date(NOW + 23 * HOUR).toISOString()})

    expect(await run()).toContain('⏰ Project abc123 expires in about 23 hours')
  })

  test('a record with no token nudges off the local clock alone', async () => {
    seedRecord({expiresAt: new Date(NOW + 23 * HOUR).toISOString(), token: undefined})

    expect(await run()).toContain('⏰ Project abc123 expires in about 23 hours')
    // No token means no org read to attempt.
    expect(mockLookupViaProject).not.toHaveBeenCalled()
  })

  test('notifies once about locally expired projects and forgets them (org read fails open)', async () => {
    mockLookupViaProject.mockResolvedValue(undefined)
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString()})

    const output = await run()

    expect(output).toContain('⌛ Unclaimed Sanity project abc123 expired on')
    expect(output).toContain('Run `sanity new --force` to mint a replacement')
    expect(storedRecords().abc123).toBeUndefined()
    // The farewell is confirmed first — via the project host, with a short abort.
    expect(mockLookupViaProject).toHaveBeenCalledWith('abc123', 'sk-robot', {timeoutMs: 500})

    expect(await run()).toBe('')
  })

  test('locally expired but actually claimed: congratulates instead of the expiry notice', async () => {
    mockLookupViaProject.mockResolvedValue('claimed')
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString()})

    const output = await run()

    expect(output).toContain('has been claimed')
    expect(output).not.toContain('expired on')
    expect(storedRecords().abc123).toBeUndefined()
  })

  test('locally expired but still claimable per the org read: keeps the record, stays quiet', async () => {
    mockLookupViaProject.mockResolvedValue('claimable')
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString()})

    const output = await run()

    expect(output).toBe('')
    // The window outlived the local estimate — kept untouched for the next run to re-check.
    expect(storedRecords().abc123).toBeDefined()
    expect(storedRecords().abc123.expiresAt).toBe(new Date(NOW - HOUR).toISOString())
  })

  test('a lapsed-but-claimable record never renders a bogus final reminder', async () => {
    mockLookupViaProject.mockResolvedValue('claimable')
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString()})

    const output = await run()

    expect(output).toBe('')
    expect(storedRecords().abc123).toBeDefined()
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

describe('#runClaimNudges ambient directory reminder', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanity-nudge-cwd-'))
  })

  afterEach(() => {
    fs.rmSync(dir, {force: true, recursive: true})
  })

  test('emits a stateless line on every run in a minted directory', async () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')
    // Above every tier threshold, so the waterfall stays silent.
    seedRecord({expiresAt: new Date(NOW + 60 * HOUR).toISOString()})

    const first = await run(NOW, dir)
    expect(first).toContain('Unclaimed Sanity project abc123 expires in about 60 hours')
    expect(first).toContain('https://www.sanity.io/claim/some-token')
    expect(first.startsWith('\n')).toBe(true)
    expect(first).toMatch(/claim it to keep it:.*\n.*https:\/\/www\.sanity\.io\/claim/)
    expect(first).not.toContain('╭')
    // No dedupe marker — the line repeats on the very next run.
    expect(storedRecords().abc123.lastNudgeTier).toBeUndefined()
    expect(await run(NOW, dir)).toBe(first)
  })

  test('yields the slot when a tiered nudge fires in the same invocation', async () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')
    seedRecord({expiresAt: new Date(NOW + 47 * HOUR).toISOString()})

    const output = await run(NOW, dir)

    expect(output).toContain('⏳ Claim your Sanity project')
    expect(output).not.toContain('claim it to keep it:')
  })

  test('verifies via the ledger token even when .env no longer carries it (post-claim handoff)', async () => {
    // The claim handoff says "login, then remove SANITY_AUTH_TOKEN"; the project id stays behind.
    // The ledger still owns the token, so the org read runs and notices the claim.
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')
    seedRecord({expiresAt: new Date(NOW + 60 * HOUR).toISOString()})
    mockLookupViaProject.mockResolvedValue('claimed')

    const output = await run(NOW, dir)

    expect(output).toContain('has been claimed')
    expect(mockLookupViaProject).toHaveBeenCalledWith('abc123', 'sk-robot', {timeoutMs: 500})
    expect(storedRecords().abc123).toBeUndefined()
  })

  test('still verifies and drops the cwd project when another project took the announce slot', async () => {
    // A sibling project's expiry farewell announces first; the cwd project must still be
    // claim-checked, or its ledger token keeps outranking a login session in getCliToken.
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')
    seedRecord({expiresAt: new Date(NOW + 60 * HOUR).toISOString()}) // cwd project, live
    seedRecord({expiresAt: new Date(NOW - HOUR).toISOString(), projectId: 'sibling'}) // expired sibling
    mockLookupViaProject.mockImplementation(async (projectId: string) =>
      projectId === 'abc123' ? 'claimed' : 'expired',
    )

    const output = await run(NOW, dir)

    // The sibling's farewell took the single announce slot...
    expect(output).toContain('Unclaimed Sanity project sibling expired')
    // ...but the cwd project was still verified as claimed and dropped from the ledger.
    expect(storedRecords().abc123).toBeUndefined()
  })

  test('drops the cwd project when its token is revoked, so login can take over', async () => {
    // A revoked (401) robot token otherwise keeps outranking the login session in getCliToken.
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')
    seedRecord({expiresAt: new Date(NOW + 60 * HOUR).toISOString()})
    mockLookupViaProject.mockResolvedValue('revoked')

    const output = await run(NOW, dir)

    expect(output).toContain('token is no longer valid')
    expect(output).toContain('sanity login')
    // A config dir auto-injects .env, so the dead token must be removed or it outranks the session.
    expect(output).toContain('remove SANITY_AUTH_TOKEN from .env')
    expect(storedRecords().abc123).toBeUndefined()
  })

  test('stays quiet when the directory points at an unregistered project', async () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="someone-elses"\n')
    seedRecord({expiresAt: new Date(NOW + 60 * HOUR).toISOString()})

    expect(await run(NOW, dir)).toBe('')
  })

  test('stays quiet in directories without a .env', async () => {
    seedRecord({expiresAt: new Date(NOW + 60 * HOUR).toISOString()})

    expect(await run(NOW, dir)).toBe('')
  })

  test('verifies every render through the project host with the ledger token', async () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')
    seedRecord({expiresAt: new Date(NOW + 60 * HOUR).toISOString()})
    mockLookupViaProject.mockResolvedValue('claimable')

    const output = await run(NOW, dir)

    expect(mockLookupViaProject).toHaveBeenCalledWith('abc123', 'sk-robot', {timeoutMs: 500})
    expect(output).toContain('Unclaimed Sanity project abc123')
  })

  test('claimed per the org read: congratulates once and drops the record', async () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')
    seedRecord({expiresAt: new Date(NOW + 60 * HOUR).toISOString()})
    mockLookupViaProject.mockResolvedValue('claimed')

    const output = await run(NOW, dir)

    expect(output).toContain('has been claimed')
    expect(output).not.toContain('claim it to keep it:')
    expect(storedRecords().abc123).toBeUndefined()
    expect(await run(NOW, dir)).toBe('')
  })

  test('expired per the org read: notes it once and drops the record', async () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')
    seedRecord({expiresAt: new Date(NOW + 60 * HOUR).toISOString()})
    mockLookupViaProject.mockResolvedValue('expired')

    const output = await run(NOW, dir)

    expect(output).toContain('expired on')
    expect(storedRecords().abc123).toBeUndefined()
  })

  test('fails open to the ledger when the org read is unavailable', async () => {
    fs.writeFileSync(path.join(dir, '.env'), 'SANITY_PROJECT_ID="abc123"\n')
    seedRecord({expiresAt: new Date(NOW + 60 * HOUR).toISOString()})
    mockLookupViaProject.mockResolvedValue(undefined)

    expect(await run(NOW, dir)).toContain('Unclaimed Sanity project abc123')
  })
})

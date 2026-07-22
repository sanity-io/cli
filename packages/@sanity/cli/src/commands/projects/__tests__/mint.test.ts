import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {NewCommand} from '../../new.js'
import {MintProjectCommand} from '../mint.js'

const mockMintUnclaimedProject = vi.hoisted(() => vi.fn())
const mockLookupClaimState = vi.hoisted(() => vi.fn())
const mockRecordMintedProject = vi.hoisted(() => vi.fn())
const mockGetMintedProjectRecord = vi.hoisted(() => vi.fn())
const mockForgetMintedProject = vi.hoisted(() => vi.fn())
const mockReadEnvValues = vi.hoisted(() => vi.fn())
const mockAppendEnvValues = vi.hoisted(() => vi.fn())
const mockInput = vi.hoisted(() => vi.fn())

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const original = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...original,
    input: mockInput,
    // Silence the flow spinner — its lifecycle is exercised via the command outcome.
    spinner: () => ({
      start: () => ({fail: vi.fn(), stopAndPersist: vi.fn()}),
    }),
  }
})
vi.mock('../../../services/mintProject.js', () => ({
  lookupClaimState: mockLookupClaimState,
  mintUnclaimedProject: mockMintUnclaimedProject,
}))
vi.mock('../../../util/claimNudges.js', () => ({
  forgetMintedProject: mockForgetMintedProject,
  getMintedProjectRecord: mockGetMintedProjectRecord,
  recordMintedProject: mockRecordMintedProject,
}))
vi.mock('../../../util/envFile.js', () => ({
  appendEnvValues: mockAppendEnvValues,
  readEnvValues: mockReadEnvValues,
}))

const mockMinted = {
  apiHost: 'https://abc123.api.sanity.io',
  claimApiUrl: 'https://api.sanity.io/v1/provision/claim',
  claimToken: 'claim-token',
  claimUrl: 'https://www.sanity.io/claim/some-token',
  datasetName: 'production',
  expiresAt: '2026-07-18T00:00:00.000Z',
  resourceId: 'abc123',
  token: 'sk-robot-token',
}

const expectedResult = {
  apiHost: mockMinted.apiHost,
  claimApiUrl: mockMinted.claimApiUrl,
  claimToken: mockMinted.claimToken,
  claimUrl: mockMinted.claimUrl,
  dataset: mockMinted.datasetName,
  expiresAt: mockMinted.expiresAt,
  projectId: mockMinted.resourceId,
  token: mockMinted.token,
}

/** `.env` contents of a directory that already went through a mint. */
const existingEnv = {
  SANITY_AUTH_TOKEN: 'sk-old-token',
  SANITY_DATASET: 'production',
  SANITY_PROJECT_ID: 'oldproj',
}

const existingRecord = {
  claimToken: 'old-claim-token',
  claimUrl: 'https://www.sanity.io/claim/old-claim-token',
  expiresAt: '2099-01-01T00:00:00.000Z',
  mintedAt: '2026-07-01T00:00:00.000Z',
  projectId: 'oldproj',
}

function loggedLines(): string {
  return vi.mocked(mocks.SanityCmdOutput.log).mock.calls.flat().join('\n')
}

beforeEach(() => {
  mockMintUnclaimedProject.mockResolvedValue(mockMinted)
  mockLookupClaimState.mockResolvedValue(undefined)
  mockGetMintedProjectRecord.mockReturnValue(undefined)
  mockForgetMintedProject.mockReturnValue(true)
  mockReadEnvValues.mockReturnValue({})
  mockAppendEnvValues.mockReturnValue({
    created: true,
    skippedKeys: [],
    wroteKeys: ['SANITY_AUTH_TOKEN', 'SANITY_DATASET', 'SANITY_PROJECT_ID'],
  })
  // Default to unattended so tests without a name argument never hang on the prompt.
  mocks.SanityCmdIsUnattended.mockReturnValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
  // oclif's catch sets process.exitCode when a command throws (in JSON mode it swallows the
  // error after printing the structured payload) — reset so tests never leak a failing code.
  process.exitCode = undefined
})

describe('#projects:mint', () => {
  test('mints a project with the provided name and narrates the flow', async () => {
    await MintProjectCommand.run(['My New Project'])

    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My New Project'})
    expect(mockRecordMintedProject).toHaveBeenCalledWith(mockMinted)
    expect(mockForgetMintedProject).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()

    const lines = loggedLines()
    // The splash renders first: squiggle art plus full link URLs.
    expect(lines).toContain('@@@@')
    expect(lines).toContain('https://sanity.new')
    expect(lines).toContain('https://sanity.io/learn')
    expect(lines).toContain("Let's get you set up with a Sanity project.")
    // The --yes hint is redundant when the run is already non-interactive.
    expect(lines).not.toContain('--yes')
    expect(lines).toContain(mockMinted.resourceId)
    expect(lines).toContain(mockMinted.datasetName)
    expect(lines).toContain(mockMinted.claimUrl)
    expect(lines).toContain(mockMinted.expiresAt)
    // Without a TTY the spinner degrades to plain rail lines through the same log sink.
    expect(lines).toContain('Minting your project...')
    expect(lines).toContain('Project minted!')
    expect(lines).toContain('Happy coding!')
  })

  test('appends credentials and claim context to .env in a fresh directory', async () => {
    await MintProjectCommand.run(['My New Project'])

    expect(mockAppendEnvValues).toHaveBeenCalledWith(
      expect.stringMatching(/\.env$/),
      {
        SANITY_AUTH_TOKEN: mockMinted.token,
        SANITY_DATASET: mockMinted.datasetName,
        SANITY_PROJECT_ID: mockMinted.resourceId,
      },
      expect.objectContaining({
        banner: expect.arrayContaining([expect.stringContaining(mockMinted.claimUrl)]),
      }),
    )
    expect(loggedLines()).toContain(
      'Saved credentials to ./.env as SANITY_AUTH_TOKEN, SANITY_DATASET, SANITY_PROJECT_ID',
    )
  })

  test('hands over the values for keys the writer skipped', async () => {
    // A template's lone SANITY_DATASET line: the writer never overwrites it, and the flow
    // prints what the key must read instead of pretending the old value is fine.
    mockReadEnvValues.mockReturnValue({SANITY_DATASET: 'production'})
    mockAppendEnvValues.mockReturnValue({
      created: false,
      skippedKeys: ['SANITY_DATASET'],
      wroteKeys: ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID'],
    })

    await MintProjectCommand.run(['My New Project'])

    const lines = loggedLines()
    expect(lines).toContain('Saved credentials to ./.env as SANITY_AUTH_TOKEN, SANITY_PROJECT_ID')
    expect(lines).toContain('./.env already has SANITY_DATASET')
    expect(lines).toContain(`SANITY_DATASET="${mockMinted.datasetName}"`)
  })

  test('blank template leftovers never swallow the token (guard-absent, writer-present)', async () => {
    // `SANITY_PROJECT_ID=` and `SANITY_AUTH_TOKEN=` lines: blank values are "absent" to the
    // guard's dotenv read (mint proceeds down the fresh lane) but "present" to the writer's
    // line check (append skips them). The skipped token's only copy must reach the terminal.
    mockReadEnvValues.mockReturnValue({})
    mockAppendEnvValues.mockReturnValue({
      created: false,
      skippedKeys: ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID'],
      wroteKeys: ['SANITY_DATASET'],
    })

    await MintProjectCommand.run(['My New Project'])

    const lines = loggedLines()
    expect(lines).toContain('./.env already has SANITY_AUTH_TOKEN, SANITY_PROJECT_ID')
    expect(lines).toContain(`SANITY_AUTH_TOKEN="${mockMinted.token}"`)
    expect(lines).toContain(`SANITY_PROJECT_ID="${mockMinted.resourceId}"`)
  })

  test('defaults the display name when unattended and no project name is provided', async () => {
    await MintProjectCommand.run([])

    expect(mockInput).not.toHaveBeenCalled()
    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My Sanity project'})
  })

  test('accepts --yes without a name argument', async () => {
    await MintProjectCommand.run(['--yes'])

    expect(mockInput).not.toHaveBeenCalled()
    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My Sanity project'})
  })

  test('prompts for the project name when attended', async () => {
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockInput.mockResolvedValue('Prompted Project')

    await MintProjectCommand.run([])

    expect(mockInput).toHaveBeenCalledWith({
      default: 'My Sanity project',
      message: 'Project name',
    })
    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'Prompted Project'})
    expect(loggedLines()).toContain('--yes')
  })

  test('returns the structured result for --json output without writing .env', async () => {
    await expect(MintProjectCommand.run(['My New Project', '--json'])).resolves.toEqual(
      expectedResult,
    )

    // The guardrail reads .env even in JSON mode — but JSON mode never writes.
    expect(mockReadEnvValues).toHaveBeenCalled()
    expect(mockAppendEnvValues).not.toHaveBeenCalled()
    expect(mockInput).not.toHaveBeenCalled()
  })

  test('propagates mint failures', async () => {
    mockMintUnclaimedProject.mockRejectedValue(new Error('Mint failed (HTTP 429): rate limited'))

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow(
      'Mint failed (HTTP 429): rate limited',
    )
    expect(mockAppendEnvValues).not.toHaveBeenCalled()
  })
})

describe('#projects:mint re-mint guardrail', () => {
  test('aborts before minting when .env holds a live unclaimed project', async () => {
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue(existingRecord)
    mockLookupClaimState.mockResolvedValue({
      expiresAt: '2099-01-01T00:00:00.000Z',
      state: 'claimable',
    })

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow(
      /already has an unclaimed Sanity project \(oldproj\)/,
    )
    expect(mockLookupClaimState).toHaveBeenCalledWith('old-claim-token', expect.anything())
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
    expect(mockAppendEnvValues).not.toHaveBeenCalled()
  })

  test('live refusal omits the expiry clause when the server returns none', async () => {
    // Server-confirmed claimable with a null expiry: the stale local date must not surface.
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue({
      ...existingRecord,
      expiresAt: '2020-01-01T00:00:00.000Z',
    })
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'claimable'})

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow(
      /already has an unclaimed Sanity project \(oldproj\)\./,
    )
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('aborts before minting when the existing project was already claimed', async () => {
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue(existingRecord)
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'claimed'})

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow(/already been claimed/)
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('mints past a verified-expired project without --force, printing the new values', async () => {
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue(existingRecord)
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'expired'})

    await MintProjectCommand.run(['My New Project'])

    expect(mockMintUnclaimedProject).toHaveBeenCalled()
    expect(mockRecordMintedProject).toHaveBeenCalledWith(mockMinted)
    // The dead project's record is dropped once its replacement exists — a re-run must refuse
    // instead of minting again against the rate cap.
    expect(mockForgetMintedProject).toHaveBeenCalledWith('oldproj')
    // .env is never modified: the new values are printed for the user to apply.
    expect(mockAppendEnvValues).not.toHaveBeenCalled()
    const lines = loggedLines()
    expect(lines).toContain('Found an expired unclaimed project (oldproj)')
    expect(lines).toContain('Update ./.env yourself')
    expect(lines).toContain(`SANITY_AUTH_TOKEN="${mockMinted.token}"`)
    expect(lines).toContain(`SANITY_PROJECT_ID="${mockMinted.resourceId}"`)
  })

  test('a failed ledger drop in the expired lane warns instead of staying silent', async () => {
    // Unwritable user config (sudo-owned file, sandboxed $HOME): the surviving record would
    // re-authorize the auto-proceed on every re-run, so the flow must say so — the warning is
    // what stops a blind agent retry loop from draining the mint budget. Still fail-open.
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue(existingRecord)
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'expired'})
    mockForgetMintedProject.mockReturnValue(false)

    await MintProjectCommand.run(['My New Project'])

    expect(mockMintUnclaimedProject).toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.warn).toHaveBeenCalledWith(
      expect.stringContaining('expired project oldproj is still recorded'),
    )
  })

  test('--json surfaces a failed ledger drop through the warnings payload', async () => {
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue(existingRecord)
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'expired'})
    mockForgetMintedProject.mockReturnValue(false)

    await expect(MintProjectCommand.run(['My New Project', '--json'])).resolves.toEqual({
      ...expectedResult,
      warnings: [
        expect.stringContaining('was not modified'),
        expect.stringContaining('is still recorded'),
      ],
    })
  })

  test('lookup failure never authorizes the expired auto-proceed, even past local expiry', async () => {
    // The project may have been claimed since the record was written — a dead lookup plus a
    // stale local clock is not evidence enough to declare it dead and spend a mint.
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue({
      ...existingRecord,
      expiresAt: '2020-01-01T00:00:00.000Z',
    })
    mockLookupClaimState.mockResolvedValue(undefined)

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow(
      /already has an unclaimed Sanity project \(oldproj\)\./,
    )
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
    expect(mockForgetMintedProject).not.toHaveBeenCalled()
  })

  test('falls back to local expiry when the claim lookup fails: live aborts', async () => {
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue(existingRecord)
    mockLookupClaimState.mockResolvedValue(undefined)

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow(
      /already has an unclaimed Sanity project/,
    )
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('a lone SANITY_DATASET (template leftover) never blocks minting', async () => {
    // An .env.example copied with a blank project id leaves only the dataset key — it carries
    // no identity or credential, so the guardrail must let the mint through without --force.
    mockReadEnvValues.mockReturnValue({SANITY_DATASET: 'production'})

    await MintProjectCommand.run(['My New Project'])

    expect(mockLookupClaimState).not.toHaveBeenCalled()
    expect(mockMintUnclaimedProject).toHaveBeenCalled()
    expect(mockAppendEnvValues).toHaveBeenCalled()
  })

  test('aborts when existing credentials cannot be traced to a mint', async () => {
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue(undefined)

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow(
      /already has Sanity credentials \(SANITY_AUTH_TOKEN, SANITY_PROJECT_ID\)/,
    )
    expect(mockLookupClaimState).not.toHaveBeenCalled()
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('unbound claimed verdicts fall back to the conservative refusal', async () => {
    // A stale SANITY_CLAIM_URL whose project was claimed proves nothing about this directory's
    // credentials — no claimed attribution, no remove-your-token advice, just the generic
    // refusal with the --force escape.
    mockReadEnvValues.mockReturnValue({
      ...existingEnv,
      SANITY_CLAIM_URL: 'https://www.sanity.io/claim/url-token',
    })
    mockGetMintedProjectRecord.mockReturnValue(undefined)
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'claimed'})

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow(
      /already has Sanity credentials/,
    )
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('unbound claim-URL evidence can refuse but never authorizes the auto-proceed', async () => {
    // A stale/unrelated SANITY_CLAIM_URL beside live credentials: its "expired" verdict is not
    // proof about SANITY_PROJECT_ID, so minting must not proceed without --force.
    mockReadEnvValues.mockReturnValue({
      ...existingEnv,
      SANITY_CLAIM_URL: 'https://www.sanity.io/claim/unrelated-token',
    })
    mockGetMintedProjectRecord.mockReturnValue(undefined)
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'expired'})

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow(
      /already has Sanity credentials/,
    )
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
    expect(mockForgetMintedProject).not.toHaveBeenCalled()
  })

  test('surfaces the credentials when the .env write fails after a successful mint', async () => {
    mockAppendEnvValues.mockImplementation(() => {
      throw new Error('EACCES: permission denied')
    })

    await MintProjectCommand.run(['My New Project'])

    const lines = loggedLines()
    expect(lines).toContain('Save these credentials yourself')
    expect(lines).toContain(`SANITY_AUTH_TOKEN="${mockMinted.token}"`)
    expect(lines).toContain(`SANITY_PROJECT_ID="${mockMinted.resourceId}"`)
  })

  test('recovers the claim token from SANITY_CLAIM_URL when the ledger has no record', async () => {
    mockReadEnvValues.mockReturnValue({
      ...existingEnv,
      SANITY_CLAIM_URL: 'https://www.sanity.io/claim/url-token',
    })
    mockGetMintedProjectRecord.mockReturnValue(undefined)
    mockLookupClaimState.mockResolvedValue({
      expiresAt: '2099-01-01T00:00:00.000Z',
      state: 'claimable',
    })

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow(
      /already has an unclaimed Sanity project/,
    )
    expect(mockLookupClaimState).toHaveBeenCalledWith('url-token', expect.anything())
  })

  test('--json refuses a live unclaimed project with a structured error, before minting', async () => {
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue(existingRecord)
    mockLookupClaimState.mockResolvedValue({
      expiresAt: '2099-01-01T00:00:00.000Z',
      state: 'claimable',
    })

    // In JSON mode oclif's catch prints `{"error": …}` and swallows — run resolves undefined.
    await expect(MintProjectCommand.run(['My New Project', '--json'])).resolves.toBeUndefined()

    expect(process.exitCode).toBe(1)
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
    expect(mockAppendEnvValues).not.toHaveBeenCalled()
  })

  test('--json still mints on verified-expired, warns about the stale .env, writes nothing', async () => {
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue(existingRecord)
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'expired'})

    await expect(MintProjectCommand.run(['My New Project', '--json'])).resolves.toEqual({
      ...expectedResult,
      warnings: [expect.stringContaining('was not modified')],
    })

    expect(mockAppendEnvValues).not.toHaveBeenCalled()
    expect(mockForgetMintedProject).toHaveBeenCalledWith('oldproj')
  })

  test('--json --force mints without verification, leaves .env alone, and warns', async () => {
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue(existingRecord)

    await expect(MintProjectCommand.run(['My New Project', '--json', '--force'])).resolves.toEqual({
      ...expectedResult,
      warnings: [expect.stringContaining('was not modified')],
    })

    expect(mockLookupClaimState).not.toHaveBeenCalled()
    expect(mockAppendEnvValues).not.toHaveBeenCalled()
  })

  test('--json --force in a bare directory appends nothing and warns about nothing', async () => {
    mockReadEnvValues.mockReturnValue({})

    await expect(MintProjectCommand.run(['My New Project', '--json', '--force'])).resolves.toEqual(
      expectedResult,
    )

    expect(mockAppendEnvValues).not.toHaveBeenCalled()
  })

  test('--force mints without prompting, leaves .env untouched, prints the new values', async () => {
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockReadEnvValues.mockReturnValue(existingEnv)
    mockGetMintedProjectRecord.mockReturnValue(existingRecord)

    await MintProjectCommand.run(['My New Project', '--force'])

    expect(mockLookupClaimState).not.toHaveBeenCalled()
    expect(mockMintUnclaimedProject).toHaveBeenCalled()
    // The old project may hold real content — its nudges keep running until claimed/expired.
    expect(mockForgetMintedProject).not.toHaveBeenCalled()
    expect(mockAppendEnvValues).not.toHaveBeenCalled()
    const lines = loggedLines()
    expect(lines).toContain('--force: minting a new project')
    expect(lines).toContain('Update ./.env yourself')
    expect(lines).toContain(`SANITY_AUTH_TOKEN="${mockMinted.token}"`)
  })
})

describe('#new', () => {
  test('runs the same mint flow as projects:mint', async () => {
    await expect(NewCommand.run(['My New Project', '--json'])).resolves.toEqual(expectedResult)

    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My New Project'})
  })

  test('does not inherit the parent hidden aliases', () => {
    expect(MintProjectCommand.hiddenAliases).toEqual(['project:mint'])
    expect(NewCommand.hiddenAliases).toEqual([])
  })
})

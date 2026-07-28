import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {NewCommand} from '../../new.js'
import {MintProjectCommand} from '../mint.js'

const mockMintUnclaimedProject = vi.hoisted(() => vi.fn())
const mockLookupClaimState = vi.hoisted(() => vi.fn())
const mockRecordMintedProject = vi.hoisted(() => vi.fn())
const mockGetMintedProjectRecord = vi.hoisted(() => vi.fn())
const mockForgetMintedProject = vi.hoisted(() => vi.fn())
const mockInspectEnvKeys = vi.hoisted(() => vi.fn())
const mockAppendEnvValues = vi.hoisted(() => vi.fn())
const mockEnsureEnvGitignored = vi.hoisted(() => vi.fn(() => ({added: false, ignored: true})))
const mockIsEnvTracked = vi.hoisted(() => vi.fn(() => false))
const mockInput = vi.hoisted(() => vi.fn())
const mockScaffoldProject = vi.hoisted(() => vi.fn())
const mockExistingScaffoldEnvFiles = vi.hoisted(() => vi.fn(() => [] as string[]))

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
vi.mock('../../../util/claimNudges.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../util/claimNudges.js')>()),
  forgetMintedProject: mockForgetMintedProject,
  getMintedProjectRecord: mockGetMintedProjectRecord,
  recordMintedProject: mockRecordMintedProject,
}))
vi.mock('../../../util/envFile.js', () => ({
  appendEnvValues: mockAppendEnvValues,
  ensureEnvGitignored: mockEnsureEnvGitignored,
  GUARDED_ENV_KEYS: ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID', 'SANITY_CLAIM_URL'],
  inspectEnvKeys: mockInspectEnvKeys,
  isEnvTracked: mockIsEnvTracked,
  TOKEN_ENV_FILES: './.env, or sanity/.env.local in a scaffolded project',
}))
vi.mock('../../../actions/scaffold/scaffoldProject.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../actions/scaffold/scaffoldProject.js')>()),
  existingScaffoldEnvFiles: mockExistingScaffoldEnvFiles,
  scaffoldProject: mockScaffoldProject,
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

/** The guard's inspection of a `.env` holding these effective (nonblank) values. */
const asInspection = (values: Record<string, string>) => ({
  blankKeys: [],
  presentKeys: Object.keys(values),
  values,
})

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
  mockRecordMintedProject.mockReturnValue(true)
  mockForgetMintedProject.mockReturnValue(true)
  mockInspectEnvKeys.mockReturnValue(asInspection({}))
  mockEnsureEnvGitignored.mockReturnValue({added: false, ignored: true})
  mockIsEnvTracked.mockReturnValue(false)
  mockExistingScaffoldEnvFiles.mockReturnValue([])
  mockAppendEnvValues.mockReturnValue({
    created: true,
    skippedKeys: [],
    wroteKeys: ['SANITY_AUTH_TOKEN', 'SANITY_DATASET', 'SANITY_PROJECT_ID'],
  })
  mockScaffoldProject.mockResolvedValue({
    frontendEnv: {
      NEXT_PUBLIC_SANITY_DATASET: mockMinted.datasetName,
      NEXT_PUBLIC_SANITY_PROJECT_ID: mockMinted.resourceId,
    },
    frontendEnvWritten: true,
    frontendPath: '/tmp/project/web',
    studioPath: '/tmp/project/sanity',
    warnings: [],
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
    // The splash renders first: squiggle art alone, no links.
    expect(lines).toContain('@@@@')
    expect(lines).not.toContain('https://sanity.io/learn')
    expect(lines).toContain("Let's get you set up with a Sanity project.")
    // The --yes hint is redundant when the run is already non-interactive.
    expect(lines).not.toContain('--yes')
    expect(lines).toContain(mockMinted.resourceId)
    expect(lines).toContain(mockMinted.datasetName)
    expect(lines).toContain(mockMinted.claimUrl)
    expect(lines).toContain(mockMinted.expiresAt)
    // Without a TTY the spinner degrades to plain rail lines through the same log sink.
    expect(lines).toContain('Minting your project...')
    expect(lines).toContain('Project minted')
    // Direct claim messaging: exact deadline, deletion consequence, and the agent handoff.
    expect(lines).toContain('You must claim this project within 72 hours')
    expect(lines).toContain('or your project will be deleted')
    expect(lines).toContain("Project credentials keep working after you've claimed")
    expect(lines).toContain('If an agent is running this, surface the full claim URL to the user.')
    expect(lines).toContain('They need to click this link to claim the project before it expires.')
    expect(lines).toContain(
      'Tell your agent to fetch https://sanity.new for instructions on what to do next.',
    )
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

  test('gitignores .env after writing it, and says so when it adds the entry', async () => {
    mockEnsureEnvGitignored.mockReturnValue({added: true, ignored: true})

    await MintProjectCommand.run(['My New Project'])

    expect(mockEnsureEnvGitignored).toHaveBeenCalledWith(expect.any(String), '.env*')
    expect(loggedLines()).toContain('Added .env* to .gitignore so the token stays out of git.')
  })

  test('stays quiet about gitignore when .env is already ignored', async () => {
    mockEnsureEnvGitignored.mockReturnValue({added: false, ignored: true})

    await MintProjectCommand.run(['My New Project'])

    expect(loggedLines()).not.toContain('Added .env to .gitignore')
  })

  test('warns when the ledger write fails, since bare-directory auth depends on it', async () => {
    mockRecordMintedProject.mockReturnValue(false)

    await MintProjectCommand.run(['My New Project'])

    const warnings = vi.mocked(mocks.SanityCmdOutput.warn).mock.calls.flat().join('\n')
    expect(warnings).toContain("Couldn't save this project to the local registry")
  })

  test('warns to untrack an already git-tracked .env, since gitignore cannot protect it', async () => {
    mockIsEnvTracked.mockReturnValue(true)
    mockEnsureEnvGitignored.mockReturnValue({added: true, ignored: true})

    await MintProjectCommand.run(['My New Project'])

    const warnings = vi.mocked(mocks.SanityCmdOutput.warn).mock.calls.flat().join('\n')
    expect(warnings).toContain('.env is already tracked by git')
    expect(warnings).toContain('git rm --cached .env')
    // The reassuring gitignore line must not appear when it wouldn't actually protect the token.
    expect(loggedLines()).not.toContain('Added .env* to .gitignore so the token stays out of git.')
  })

  test('warns when .env cannot be gitignored, so the token is never silently committable', async () => {
    // {added: false, ignored: false} is the write-failure signal — distinct from "already
    // ignored" ({added: false, ignored: true}), which stays quiet.
    mockEnsureEnvGitignored.mockReturnValue({added: false, ignored: false})

    await MintProjectCommand.run(['My New Project'])

    const warnings = vi.mocked(mocks.SanityCmdOutput.warn).mock.calls.flat().join('\n')
    expect(warnings).toContain("Couldn't add .env* to .gitignore")
  })

  test('hands over the values for keys the writer skipped', async () => {
    // A template's lone SANITY_DATASET line: the writer never overwrites it, and the flow
    // prints what the key must read instead of pretending the old value is fine.
    mockInspectEnvKeys.mockReturnValue(asInspection({SANITY_DATASET: 'production'}))
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
    // Blank guarded placeholders now refuse up front (see mint.blankEnv.test.ts), so with the
    // real helpers this state needs an unguarded shadowed key or a race. If the writer ever
    // skips keys the guard let through, the skipped token's only copy must reach the terminal.
    mockInspectEnvKeys.mockReturnValue(asInspection({}))
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

  test('gitignores .env even when every key was already present', async () => {
    // All keys skipped means wroteKeys is empty, but .env still carries the token — the gitignore
    // step must not be gated on having written keys this run.
    mockAppendEnvValues.mockReturnValue({
      created: false,
      skippedKeys: ['SANITY_AUTH_TOKEN', 'SANITY_DATASET', 'SANITY_PROJECT_ID'],
      wroteKeys: [],
    })
    mockEnsureEnvGitignored.mockReturnValue({added: true, ignored: true})

    await MintProjectCommand.run(['My New Project'])

    expect(mockEnsureEnvGitignored).toHaveBeenCalledWith(expect.any(String), '.env*')
    expect(loggedLines()).toContain('Added .env* to .gitignore so the token stays out of git.')
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
    expect(mockInspectEnvKeys).toHaveBeenCalled()
    expect(mockAppendEnvValues).not.toHaveBeenCalled()
    expect(mockInput).not.toHaveBeenCalled()
    // "No files written" includes the user-config ledger — the caller owns the returned token.
    expect(mockRecordMintedProject).not.toHaveBeenCalled()
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
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
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
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
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
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
    mockGetMintedProjectRecord.mockReturnValue(existingRecord)
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'claimed'})

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow(/already been claimed/)
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('mints past a verified-expired project without --force, printing the new values', async () => {
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
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
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
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
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
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
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
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
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
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
    mockInspectEnvKeys.mockReturnValue(asInspection({SANITY_DATASET: 'production'}))

    await MintProjectCommand.run(['My New Project'])

    expect(mockLookupClaimState).not.toHaveBeenCalled()
    expect(mockMintUnclaimedProject).toHaveBeenCalled()
    expect(mockAppendEnvValues).toHaveBeenCalled()
  })

  test('aborts when existing credentials cannot be traced to a mint', async () => {
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
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
    mockInspectEnvKeys.mockReturnValue(
      asInspection({...existingEnv, SANITY_CLAIM_URL: 'https://www.sanity.io/claim/url-token'}),
    )
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
    mockInspectEnvKeys.mockReturnValue(
      asInspection({
        ...existingEnv,
        SANITY_CLAIM_URL: 'https://www.sanity.io/claim/unrelated-token',
      }),
    )
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
    expect(lines).toContain('Add these to ./.env yourself, and keep .env out of git')
    expect(lines).toContain(`SANITY_AUTH_TOKEN="${mockMinted.token}"`)
    expect(lines).toContain(`SANITY_PROJECT_ID="${mockMinted.resourceId}"`)
  })

  test('recovers the claim token from SANITY_CLAIM_URL when the ledger has no record', async () => {
    mockInspectEnvKeys.mockReturnValue(
      asInspection({...existingEnv, SANITY_CLAIM_URL: 'https://www.sanity.io/claim/url-token'}),
    )
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
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
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
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
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
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
    mockGetMintedProjectRecord.mockReturnValue(existingRecord)

    await expect(MintProjectCommand.run(['My New Project', '--json', '--force'])).resolves.toEqual({
      ...expectedResult,
      warnings: [expect.stringContaining('was not modified')],
    })

    expect(mockLookupClaimState).not.toHaveBeenCalled()
    expect(mockAppendEnvValues).not.toHaveBeenCalled()
  })

  test('--json --force in a bare directory appends nothing and warns about nothing', async () => {
    mockInspectEnvKeys.mockReturnValue(asInspection({}))

    await expect(MintProjectCommand.run(['My New Project', '--json', '--force'])).resolves.toEqual(
      expectedResult,
    )

    expect(mockAppendEnvValues).not.toHaveBeenCalled()
  })

  test('--force mints without prompting, leaves .env untouched, prints the new values', async () => {
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
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

  test('a shadowed token alone does not block the scaffold', async () => {
    mockAppendEnvValues.mockReturnValue({
      created: false,
      skippedKeys: ['SANITY_AUTH_TOKEN'],
      wroteKeys: ['SANITY_PROJECT_ID', 'SANITY_DATASET'],
    })

    await MintProjectCommand.run(['My New Project'])

    // The scaffold writes the token into sanity/.env.local from the mint payload, and ledger auth
    // keys off the project id, so only a missing project id can stop it.
    expect(mockScaffoldProject).toHaveBeenCalled()
    const lines = loggedLines()
    expect(lines).not.toContain('Skipping the sanity/ and web/ scaffold')
    expect(lines).toContain('./.env already has SANITY_AUTH_TOKEN')
    expect(lines).toContain(`SANITY_AUTH_TOKEN="${mockMinted.token}"`)
  })

  test('blank template lines shadow the write, so the scaffold is skipped too', async () => {
    mockAppendEnvValues.mockReturnValue({
      created: false,
      skippedKeys: ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID'],
      wroteKeys: ['SANITY_DATASET'],
    })

    await MintProjectCommand.run(['My New Project'])

    expect(mockMintUnclaimedProject).toHaveBeenCalled()
    expect(mockScaffoldProject).not.toHaveBeenCalled()
    const lines = loggedLines()
    expect(lines).toContain('Skipping the sanity/ and web/ scaffold')
    expect(lines).toContain('shadowed the values')
    expect(lines).toContain(`SANITY_AUTH_TOKEN="${mockMinted.token}"`)
    expect(lines).toContain(`SANITY_PROJECT_ID="${mockMinted.resourceId}"`)
  })

  test('a skipped dataset exemplar alone still scaffolds', async () => {
    mockAppendEnvValues.mockReturnValue({
      created: false,
      skippedKeys: ['SANITY_DATASET'],
      wroteKeys: ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID'],
    })

    await MintProjectCommand.run(['My New Project'])

    expect(mockScaffoldProject).toHaveBeenCalled()
    expect(loggedLines()).not.toContain('Skipping the sanity/ and web/ scaffold')
  })

  test('a failed .env write skips the scaffold instead of building on a broken directory', async () => {
    mockAppendEnvValues.mockImplementation(() => {
      throw new Error('EACCES')
    })

    await MintProjectCommand.run(['My New Project'])

    expect(mockMintUnclaimedProject).toHaveBeenCalled()
    expect(mockScaffoldProject).not.toHaveBeenCalled()
    const lines = loggedLines()
    expect(lines).toContain('Add these to ./.env yourself')
    expect(lines).toContain('Skipping the sanity/ and web/ scaffold')
    expect(lines).not.toContain('./.env is written')
    expect(loggedLines()).toContain(mockMinted.claimUrl)
  })

  test('a remint names the scaffolded env files that still hold dead values', async () => {
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
    mockExistingScaffoldEnvFiles.mockReturnValue(['sanity/.env.local', 'web/.env.local'])

    await MintProjectCommand.run(['My New Project', '--force'])

    const lines = loggedLines()
    expect(lines).toContain('still hold superseded values')
    expect(lines).toContain(`sanity/.env.local: SANITY_AUTH_TOKEN="${mockMinted.token}"`)
    expect(lines).toContain(
      `web/.env.local: NEXT_PUBLIC_SANITY_PROJECT_ID="${mockMinted.resourceId}"`,
    )
    expect(lines).not.toContain(`web/.env.local: SANITY_API_READ_TOKEN`)
  })

  test('a remint names keys only for the scaffolded env files that exist', async () => {
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
    mockExistingScaffoldEnvFiles.mockReturnValue(['web/.env.local'])

    await MintProjectCommand.run(['My New Project', '--force'])

    const lines = loggedLines()
    expect(lines).toContain(`web/.env.local: NEXT_PUBLIC_SANITY_PROJECT_ID`)
    expect(lines).not.toContain('sanity/.env.local:')
  })

  test('a remint stays quiet about scaffolded env files when there are none', async () => {
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
    mockExistingScaffoldEnvFiles.mockReturnValue([])

    await MintProjectCommand.run(['My New Project', '--force'])

    expect(loggedLines()).not.toContain('still hold superseded values')
  })

  test('--json surfaces the stale scaffolded env files as a warning', async () => {
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))
    mockExistingScaffoldEnvFiles.mockReturnValue(['sanity/.env.local', 'web/.env.local'])

    const result = await MintProjectCommand.run(['My New Project', '--force', '--json'])

    expect(result.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('still hold superseded values')]),
    )
    const stale = result.warnings?.find((w) => w.includes('still hold superseded values')) ?? ''
    expect(stale).toContain('sanity/.env.local (SANITY_AUTH_TOKEN)')
    expect(stale).toContain(
      'web/.env.local (NEXT_PUBLIC_SANITY_PROJECT_ID, NEXT_PUBLIC_SANITY_DATASET)',
    )
    expect(stale).toContain('keep the token out of web/.env.local')
    // Empty parens mean a named file resolved to no keys, which is how a separator mismatch shows up.
    expect(stale).not.toContain('()')
  })

  test('recovery advice gives the real scaffold commands, never --force', async () => {
    mockAppendEnvValues.mockReturnValue({
      created: false,
      skippedKeys: ['SANITY_AUTH_TOKEN', 'SANITY_PROJECT_ID'],
      wroteKeys: [],
    })

    await MintProjectCommand.run(['My New Project'])

    const lines = loggedLines()
    expect(lines).toContain(
      `npx sanity init --project ${mockMinted.resourceId} --dataset ${mockMinted.datasetName} --output-path sanity`,
    )
    expect(lines).toContain('npx --yes create-next-app@^16 web')
    expect(lines).toContain(`sanity/.env.local: SANITY_AUTH_TOKEN="${mockMinted.token}"`)
    expect(lines).toContain(
      `web/.env.local: NEXT_PUBLIC_SANITY_PROJECT_ID="${mockMinted.resourceId}"`,
    )
    expect(lines).not.toMatch(/web\/\.env\.local: SANITY_AUTH_TOKEN/)
    expect(lines).not.toMatch(/Set them to the values shown, then run/)
    expect(lines).not.toMatch(/scaffold it yourself with `sanity init`/)
  })

  test('a scaffold throw also points at the real commands, and says no re-mint is needed', async () => {
    mockScaffoldProject.mockRejectedValue(new Error('disk full'))

    await MintProjectCommand.run(['My New Project'])

    expect(mocks.SanityCmdOutput.warn).toHaveBeenCalledWith(
      expect.stringContaining('nothing needs re-minting'),
    )
    const lines = loggedLines()
    expect(lines).toContain('Scaffold it yourself with:')
    expect(lines).toContain('npx --yes create-next-app@^16 web')
  })

  test('scaffolds both folders and points at each dev server', async () => {
    await MintProjectCommand.run(['My New Project'])

    expect(mockScaffoldProject).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: mockMinted.datasetName,
        displayName: 'My New Project',
        projectId: mockMinted.resourceId,
        token: mockMinted.token,
      }),
    )
    const lines = loggedLines()
    expect(lines).toContain('Created ./sanity (Studio) and ./web (frontend).')
    expect(lines).toContain('cd sanity && npx sanity dev')
    expect(lines).toContain('cd web && npm run dev')
    expect(lines).toContain('Your dataset is private until you claim it')
  })

  test('--no-scaffold mints without touching the filesystem beyond .env', async () => {
    await MintProjectCommand.run(['My New Project', '--no-scaffold'])

    expect(mockMintUnclaimedProject).toHaveBeenCalled()
    expect(mockScaffoldProject).not.toHaveBeenCalled()
  })

  test('does not scaffold in JSON mode', async () => {
    await expect(MintProjectCommand.run(['My New Project', '--json'])).resolves.toEqual(
      expectedResult,
    )

    expect(mockScaffoldProject).not.toHaveBeenCalled()
  })

  test('does not scaffold over a directory that already had credentials', async () => {
    mockInspectEnvKeys.mockReturnValue(asInspection(existingEnv))

    await MintProjectCommand.run(['My New Project', '--force'])

    expect(mockMintUnclaimedProject).toHaveBeenCalled()
    expect(mockScaffoldProject).not.toHaveBeenCalled()
  })

  test('prints the frontend env values when an app is already present', async () => {
    mockScaffoldProject.mockResolvedValue({
      detectedFramework: 'Next.js',
      frontendEnv: {
        NEXT_PUBLIC_SANITY_DATASET: mockMinted.datasetName,
        NEXT_PUBLIC_SANITY_PROJECT_ID: mockMinted.resourceId,
      },
      frontendEnvWritten: false,
      studioPath: '/tmp/project/sanity',
      warnings: [],
    })

    await MintProjectCommand.run(['My New Project'])

    const lines = loggedLines()
    expect(lines).toContain('Found Next.js here, so only ./sanity was created.')
    expect(lines).toContain(`NEXT_PUBLIC_SANITY_PROJECT_ID="${mockMinted.resourceId}"`)
    expect(lines).not.toContain('cd web && npm run dev')
  })

  test('surfaces scaffold warnings without failing the mint', async () => {
    mockScaffoldProject.mockResolvedValue({
      frontendEnv: {},
      frontendEnvWritten: false,
      studioPath: '/tmp/project/sanity',
      warnings: ['create-next-app failed: boom. Scaffold the frontend yourself.'],
    })

    await MintProjectCommand.run(['My New Project'])

    expect(mocks.SanityCmdOutput.warn).toHaveBeenCalledWith(
      expect.stringContaining('create-next-app failed: boom'),
    )
  })

  test('when the frontend was not created, says what exists and hands over its env values', async () => {
    mockScaffoldProject.mockResolvedValue({
      frontendEnv: {NEXT_PUBLIC_SANITY_PROJECT_ID: mockMinted.resourceId},
      frontendEnvWritten: false,
      studioPath: '/tmp/project/sanity',
      warnings: ['create-next-app failed: boom. Scaffold the frontend yourself.'],
    })

    await MintProjectCommand.run(['My New Project'])

    const lines = loggedLines()
    expect(lines).toContain('Created ./sanity (Studio). The frontend was not created.')
    expect(lines).toContain('cd sanity && npx sanity dev')
    expect(lines).toContain(`NEXT_PUBLIC_SANITY_PROJECT_ID="${mockMinted.resourceId}"`)
    expect(lines).not.toContain('cd web && npm run dev')
  })

  test('prints the frontend values when the frontend exists but its env write failed', async () => {
    mockScaffoldProject.mockResolvedValue({
      frontendEnv: {NEXT_PUBLIC_SANITY_PROJECT_ID: mockMinted.resourceId},
      frontendEnvWritten: false,
      frontendPath: '/tmp/project/web',
      studioPath: '/tmp/project/sanity',
      warnings: ["Couldn't write web/.env.local."],
    })

    await MintProjectCommand.run(['My New Project'])

    const lines = loggedLines()
    expect(lines).toContain('Created ./sanity (Studio) and ./web (frontend).')
    expect(lines).toContain("./web/.env.local wasn't written.")
    expect(lines).toContain(`NEXT_PUBLIC_SANITY_PROJECT_ID="${mockMinted.resourceId}"`)
  })

  test('stays quiet about env values when the frontend env write succeeded', async () => {
    await MintProjectCommand.run(['My New Project'])

    const lines = loggedLines()
    expect(lines).not.toContain("wasn't written")
    expect(lines).not.toContain(`NEXT_PUBLIC_SANITY_PROJECT_ID="${mockMinted.resourceId}"`)
  })

  test('never prints the token as a frontend env value', async () => {
    mockScaffoldProject.mockResolvedValue({
      detectedFramework: 'Next.js',
      frontendEnv: {NEXT_PUBLIC_SANITY_PROJECT_ID: mockMinted.resourceId},
      frontendEnvWritten: false,
      studioPath: '/tmp/project/sanity',
      warnings: [],
    })

    await MintProjectCommand.run(['My New Project'])

    const lines = loggedLines()
    expect(lines).not.toContain('SANITY_API_READ_TOKEN')
    expect(lines).toContain('Copy SANITY_AUTH_TOKEN from ./.env')
  })

  test('names the right public prefix convention for a non-Next framework', async () => {
    mockScaffoldProject.mockResolvedValue({
      detectedFramework: 'Astro',
      frontendEnv: {NEXT_PUBLIC_SANITY_PROJECT_ID: mockMinted.resourceId},
      frontendEnvWritten: false,
      studioPath: '/tmp/project/sanity',
      warnings: [],
    })

    await MintProjectCommand.run(['My New Project'])

    const lines = loggedLines()
    expect(lines).toContain('Found Astro here, so only ./sanity was created.')
    expect(lines).toContain('Those names follow the Next.js convention.')
  })

  test('does not add the prefix caveat when the detected framework is Next.js', async () => {
    mockScaffoldProject.mockResolvedValue({
      detectedFramework: 'Next.js',
      frontendEnv: {NEXT_PUBLIC_SANITY_PROJECT_ID: mockMinted.resourceId},
      frontendEnvWritten: false,
      studioPath: '/tmp/project/sanity',
      warnings: [],
    })

    await MintProjectCommand.run(['My New Project'])

    expect(loggedLines()).not.toContain('follow the Next.js convention')
  })

  test('a scaffold failure never reads as a mint failure', async () => {
    mockScaffoldProject.mockRejectedValue(new Error('disk full'))

    await expect(MintProjectCommand.run(['My New Project'])).resolves.toEqual(expectedResult)

    expect(mocks.SanityCmdOutput.warn).toHaveBeenCalledWith(
      expect.stringContaining("Couldn't scaffold the project (disk full)"),
    )
    expect(loggedLines()).toContain(mockMinted.claimUrl)
  })

  test('a scaffold SIGINT aborts instead of degrading to a warning', async () => {
    mockScaffoldProject.mockRejectedValue(new Error('SIGINT'))

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow('SIGINT')

    expect(mocks.SanityCmdOutput.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("Couldn't scaffold the project"),
    )
  })

  test('aborts an active scaffold when the command receives SIGINT', async () => {
    const existingListeners = process.rawListeners('SIGINT')
    mockScaffoldProject.mockImplementation(async ({cancelSignal}) => {
      const sigintHandler = process
        .rawListeners('SIGINT')
        .find((listener) => !existingListeners.includes(listener))
      expect(sigintHandler).toBeDefined()
      sigintHandler?.()
      expect(cancelSignal.aborted).toBe(true)
      return {
        frontendEnv: {},
        frontendEnvWritten: false,
        studioPath: '/tmp/project/sanity',
        warnings: [],
      }
    })

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow('SIGINT')

    expect(mocks.SanityCmdOutput.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("Couldn't scaffold the project"),
    )
    expect(process.rawListeners('SIGINT')).toEqual(existingListeners)
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

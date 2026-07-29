import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {MintProjectCommand} from '../mint.js'

// The blank-placeholder refusal exists because line presence (the writer's definition of
// "exists") and effective dotenv value (the guard's) can disagree. Proving it with mocked env
// helpers would just restate the mocks, so this suite runs the real envFile implementation
// against a real temporary `.env` and only mocks the external boundaries.
const mockMintUnclaimedProject = vi.hoisted(() => vi.fn())
const mockLookupClaimState = vi.hoisted(() => vi.fn())
const mockRecordMintedProject = vi.hoisted(() => vi.fn())
const mockGetMintedProjectRecord = vi.hoisted(() => vi.fn())
const mockForgetMintedProject = vi.hoisted(() => vi.fn())
const mockScaffoldProject = vi.hoisted(() => vi.fn())

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
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
vi.mock('../../../actions/scaffold/scaffoldProject.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../actions/scaffold/scaffoldProject.js')>()),
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

let dir: string
let envPath: string
let cwdSpy: ReturnType<typeof vi.spyOn>

function listDir(): string[] {
  return fs.readdirSync(dir).toSorted()
}

function enterMintedDescendant(): {descendant: string; envReference: string} {
  const descendant = path.join(dir, 'web')
  fs.mkdirSync(descendant)
  cwdSpy.mockReturnValue(descendant)
  fs.writeFileSync(envPath, 'SANITY_PROJECT_ID="abc123"\nSANITY_AUTH_TOKEN="sk-root-robot"\n')
  return {descendant, envReference: path.relative(descendant, envPath)}
}

async function runAndCatch(
  argv: string[],
): Promise<Error & {code?: string; suggestions?: string[]}> {
  const err = await MintProjectCommand.run(argv).then(
    () => undefined,
    (thrown: unknown) => thrown,
  )
  expect(err).toBeInstanceOf(Error)
  return err as Error & {code?: string; suggestions?: string[]}
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanity-mint-blankenv-'))
  envPath = path.join(dir, '.env')
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(dir)

  mockMintUnclaimedProject.mockResolvedValue(mockMinted)
  mockLookupClaimState.mockResolvedValue(undefined)
  mockGetMintedProjectRecord.mockReturnValue(undefined)
  mockRecordMintedProject.mockReturnValue(true)
  mockForgetMintedProject.mockReturnValue(true)
  mockScaffoldProject.mockResolvedValue({
    frontendEnv: {},
    frontendEnvWritten: true,
    frontendPath: path.join(dir, 'web'),
    studioPath: path.join(dir, 'sanity'),
    warnings: [],
  })
  mocks.SanityCmdIsUnattended.mockReturnValue(true)
})

afterEach(() => {
  cwdSpy.mockRestore()
  vi.clearAllMocks()
  fs.rmSync(dir, {force: true, recursive: true})
  process.exitCode = undefined
})

describe('#projects:mint blank .env placeholders (real env helpers)', () => {
  const blankEnv = 'SANITY_PROJECT_ID=\nSANITY_AUTH_TOKEN=\n'

  test('refuses a second mint from a generated descendant of the mint root', async () => {
    const {descendant, envReference} = enterMintedDescendant()

    const err = await runAndCatch(['My New Project'])

    expect(err.code).toBe('UNVERIFIED_SANITY_CREDENTIALS')
    expect(err.message).toContain(`The ancestor ${envReference} already has`)
    expect(err.message).not.toContain("This directory's .env")
    expect(err.suggestions?.join('\n')).toContain(
      `outside the project scope established by ${envReference}`,
    )
    expect(err.suggestions?.join('\n')).not.toContain('in a different directory')
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(descendant, '.env'))).toBe(false)
  })

  test('claimed-project cleanup names the ancestor token files from a descendant', async () => {
    const {descendant, envReference} = enterMintedDescendant()
    const studioEnvReference = path.relative(descendant, path.join(dir, 'sanity', '.env.local'))
    mockGetMintedProjectRecord.mockReturnValue({
      claimToken: 'old-claim-token',
      projectId: 'abc123',
    })
    mockLookupClaimState.mockResolvedValue({expiresAt: null, state: 'claimed'})

    const err = await runAndCatch(['My New Project'])
    const suggestions = err.suggestions?.join('\n')

    expect(err.code).toBe('CLAIMED_PROJECT_IN_ENV')
    expect(suggestions).toContain(
      `remove SANITY_AUTH_TOKEN from ${envReference} or ${studioEnvReference}`,
    )
    expect(suggestions).not.toContain('./.env or sanity/.env.local')
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('--force replacement discovers and names stale files in the ancestor scope', async () => {
    const {descendant, envReference} = enterMintedDescendant()
    const studioDir = path.join(dir, 'sanity')
    fs.mkdirSync(studioDir)
    fs.writeFileSync(path.join(studioDir, '.env.local'), 'SANITY_AUTH_TOKEN="sk-root-robot"\n')
    fs.writeFileSync(
      path.join(descendant, '.env.local'),
      'NEXT_PUBLIC_SANITY_PROJECT_ID="abc123"\n',
    )
    const studioEnvReference = path.relative(descendant, path.join(studioDir, '.env.local'))
    const frontendEnvReference = path.relative(descendant, path.join(descendant, '.env.local'))

    await MintProjectCommand.run(['My New Project', '--force'])

    const lines = vi.mocked(mocks.SanityCmdOutput.log).mock.calls.flat().join('\n')
    expect(lines).toContain(
      `--force: minting a new project. ${envReference} is left untouched; new values follow.`,
    )
    expect(lines).toContain(`Update ${envReference} yourself`)
    expect(lines).toContain(
      `${studioEnvReference} and ${frontendEnvReference} still hold superseded values`,
    )
    expect(lines).toContain(`because ${envReference} still points at the previous project`)
    expect(lines).not.toContain('Update ./.env yourself')
    expect(mockMintUnclaimedProject).toHaveBeenCalled()
    expect(mockScaffoldProject).not.toHaveBeenCalled()
  })

  test('refuses before provisioning and leaves the directory untouched', async () => {
    fs.writeFileSync(envPath, blankEnv)

    const err = await runAndCatch(['My New Project'])

    expect(err.message).toContain(
      'blank Sanity credential placeholders: SANITY_AUTH_TOKEN, SANITY_PROJECT_ID',
    )
    expect(err.message).toContain('No project was minted')
    expect(err.code).toBe('BLANK_SANITY_ENV_VALUES')
    expect(err.suggestions?.join('\n')).toContain('Remove those blank lines')
    // --force cannot fix this (the writer never edits existing lines), so never suggest it.
    expect(err.message).not.toContain('--force')
    expect(err.suggestions?.join('\n')).not.toContain('--force')

    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
    expect(mockRecordMintedProject).not.toHaveBeenCalled()
    expect(mockScaffoldProject).not.toHaveBeenCalled()
    // No filesystem side effects: .env is byte-identical and nothing else was created.
    expect(fs.readFileSync(envPath, 'utf8')).toBe(blankEnv)
    expect(listDir()).toEqual(['.env'])
  })

  test('--force does not bypass the refusal', async () => {
    fs.writeFileSync(envPath, blankEnv)

    const err = await runAndCatch(['My New Project', '--force'])

    expect(err.code).toBe('BLANK_SANITY_ENV_VALUES')
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
    expect(fs.readFileSync(envPath, 'utf8')).toBe(blankEnv)
  })

  test('a second run against the unchanged file still refuses without provisioning', async () => {
    fs.writeFileSync(envPath, blankEnv)

    const first = await runAndCatch(['My New Project'])
    const second = await runAndCatch(['My New Project'])

    expect(first.code).toBe('BLANK_SANITY_ENV_VALUES')
    expect(second.code).toBe('BLANK_SANITY_ENV_VALUES')
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
    expect(fs.readFileSync(envPath, 'utf8')).toBe(blankEnv)
  })

  test('reports only the keys that are actually blank', async () => {
    // A whitespace-only quoted value and an export-prefixed blank line both count as blank;
    // the nonblank claim URL must not be named.
    fs.writeFileSync(
      envPath,
      'export SANITY_AUTH_TOKEN=\nSANITY_PROJECT_ID="   "\nSANITY_CLAIM_URL=https://www.sanity.io/claim/tok\n',
    )

    const err = await runAndCatch(['My New Project'])

    expect(err.code).toBe('BLANK_SANITY_ENV_VALUES')
    expect(err.message).toContain('SANITY_AUTH_TOKEN, SANITY_PROJECT_ID')
    expect(err.message).not.toContain('SANITY_CLAIM_URL')
    expect(mockMintUnclaimedProject).not.toHaveBeenCalled()
  })

  test('a blank unguarded key (SANITY_DATASET=) does not trigger the refusal', async () => {
    fs.writeFileSync(envPath, 'SANITY_DATASET=\n')

    await MintProjectCommand.run(['My New Project'])

    expect(mockMintUnclaimedProject).toHaveBeenCalled()
    // The real writer appends the guarded keys but skips the blank SANITY_DATASET line.
    const contents = fs.readFileSync(envPath, 'utf8')
    expect(contents).toContain('SANITY_DATASET=\n')
    expect(contents).toContain(`SANITY_PROJECT_ID="${mockMinted.resourceId}"`)
    expect(contents).toContain(`SANITY_AUTH_TOKEN="${mockMinted.token}"`)
    expect(contents).not.toContain(`SANITY_DATASET="${mockMinted.datasetName}"`)
  })

  test('a directory with no .env mints and persists credentials with the real helpers', async () => {
    await MintProjectCommand.run(['My New Project'])

    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My New Project'})
    const contents = fs.readFileSync(envPath, 'utf8')
    expect(contents).toContain(`SANITY_PROJECT_ID="${mockMinted.resourceId}"`)
    expect(contents).toContain(`SANITY_AUTH_TOKEN="${mockMinted.token}"`)
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')).toContain('.env*')
  })
})

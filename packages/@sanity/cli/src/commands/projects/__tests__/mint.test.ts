import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {NewCommand} from '../../new.js'
import {MintProjectCommand} from '../mint.js'

const mockMintUnclaimedProject = vi.hoisted(() => vi.fn())
const mockRecordMintedProject = vi.hoisted(() => vi.fn())
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
  mintUnclaimedProject: mockMintUnclaimedProject,
}))
vi.mock('../../../util/claimNudges.js', () => ({
  recordMintedProject: mockRecordMintedProject,
}))
vi.mock('../../../util/envFile.js', () => ({
  appendEnvValues: mockAppendEnvValues,
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

function loggedLines(): string {
  return vi.mocked(mocks.SanityCmdOutput.log).mock.calls.flat().join('\n')
}

beforeEach(() => {
  mockMintUnclaimedProject.mockResolvedValue(mockMinted)
  mockAppendEnvValues.mockReturnValue({
    created: true,
    skippedKeys: [],
    wroteKeys: ['SANITY_PROJECT_ID', 'SANITY_DATASET', 'SANITY_API_TOKEN'],
  })
  // Default to unattended so tests without a name argument never hang on the prompt.
  mocks.SanityCmdIsUnattended.mockReturnValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#projects:mint', () => {
  test('mints a project with the provided name and narrates the flow', async () => {
    await MintProjectCommand.run(['My New Project'])

    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My New Project'})
    expect(mockRecordMintedProject).toHaveBeenCalledWith(mockMinted)
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

  test('writes credentials and claim context to .env', async () => {
    await MintProjectCommand.run(['My New Project'])

    expect(mockAppendEnvValues).toHaveBeenCalledWith(
      expect.stringMatching(/\.env$/),
      {
        SANITY_API_TOKEN: mockMinted.token,
        SANITY_DATASET: mockMinted.datasetName,
        SANITY_PROJECT_ID: mockMinted.resourceId,
      },
      {banner: expect.arrayContaining([expect.stringContaining(mockMinted.claimUrl)])},
    )
    expect(loggedLines()).toContain(
      'Saved credentials to ./.env as SANITY_PROJECT_ID, SANITY_DATASET, SANITY_API_TOKEN',
    )
  })

  test('reports keys it left untouched in an existing .env', async () => {
    mockAppendEnvValues.mockReturnValue({
      created: false,
      skippedKeys: ['SANITY_API_TOKEN'],
      wroteKeys: ['SANITY_PROJECT_ID', 'SANITY_DATASET'],
    })

    await MintProjectCommand.run(['My New Project'])

    const lines = loggedLines()
    expect(lines).toContain('Saved credentials to ./.env as SANITY_PROJECT_ID, SANITY_DATASET')
    expect(lines).toContain('Left existing SANITY_API_TOKEN in ./.env untouched.')
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

  test('returns the structured result for --json output without touching .env', async () => {
    await expect(MintProjectCommand.run(['My New Project', '--json'])).resolves.toEqual(
      expectedResult,
    )

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

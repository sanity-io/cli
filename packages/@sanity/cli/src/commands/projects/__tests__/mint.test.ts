import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {NewCommand} from '../../new.js'
import {MintProjectCommand} from '../mint.js'

const mockMintUnclaimedProject = vi.hoisted(() => vi.fn())
const mockRecordMintedProject = vi.hoisted(() => vi.fn())

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('../../../services/mintProject.js', () => ({
  mintUnclaimedProject: mockMintUnclaimedProject,
}))
vi.mock('../../../util/claimNudges.js', () => ({
  recordMintedProject: mockRecordMintedProject,
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

beforeEach(() => {
  mockMintUnclaimedProject.mockResolvedValue(mockMinted)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('#projects:mint', () => {
  test('mints a project with the provided name and prints claim instructions', async () => {
    await MintProjectCommand.run(['My New Project'])

    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My New Project'})
    expect(mockRecordMintedProject).toHaveBeenCalledWith(mockMinted)
    expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining('Your project is live now'),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(mockMinted.resourceId),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(mockMinted.datasetName),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(mockMinted.claimUrl),
    )
    expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
      expect.stringContaining(mockMinted.expiresAt),
    )
  })

  test('defaults the display name when no project name is provided', async () => {
    await MintProjectCommand.run([])

    expect(mockMintUnclaimedProject).toHaveBeenCalledWith({displayName: 'My Sanity project'})
  })

  test('returns the structured result for --json output', async () => {
    await expect(MintProjectCommand.run(['My New Project', '--json'])).resolves.toEqual(
      expectedResult,
    )
  })

  test('propagates mint failures', async () => {
    mockMintUnclaimedProject.mockRejectedValue(new Error('Mint failed (HTTP 429): rate limited'))

    await expect(MintProjectCommand.run(['My New Project'])).rejects.toThrow(
      'Mint failed (HTTP 429): rate limited',
    )
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

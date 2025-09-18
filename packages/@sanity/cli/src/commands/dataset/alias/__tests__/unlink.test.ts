import {input} from '@inquirer/prompts'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../../util/errorMessages.js'
import {UnlinkAliasCommand} from '../unlink.js'

vi.mock('../../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../../../../../cli-core/src/services/apiClient.js', () => ({
  getProjectCliClient: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
}))

const mockGetProjectCliClient = vi.mocked(getProjectCliClient)
const mockGetCliConfig = vi.mocked(getCliConfig)
const mockInput = vi.mocked(input)

const setupMockClient = ({
  aliases = [
    {datasetName: 'production', name: 'staging'},
    {datasetName: null, name: 'unlinked'},
  ],
  unlinkAliasResponse = {aliasName: 'staging', datasetName: 'production'},
}: {
  aliases?: Array<{datasetName: string | null; name: string}>
  unlinkAliasResponse?: {aliasName: string; datasetName: string | null}
} = {}) => {
  const mockClient = {
    request: vi.fn(),
  }

  mockClient.request.mockImplementation((config) => {
    if (config.uri === '/aliases') {
      return Promise.resolve(aliases)
    }
    if (config.uri?.includes('/unlink') && config.method === 'PATCH') {
      return Promise.resolve(unlinkAliasResponse)
    }
    return Promise.resolve({})
  })

  mockGetProjectCliClient.mockResolvedValue(mockClient as never)
}

describe('dataset:alias:unlink', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('unlinks alias with confirmation when alias name provided without ~ prefix', async () => {
    setupMockClient()
    mockInput.mockResolvedValueOnce('yes')

    const {stdout} = await testCommand(UnlinkAliasCommand, ['staging'])

    expect(stdout).toContain('Dataset alias ~staging unlinked from production successfully')
    expect(mockInput).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'Are you ABSOLUTELY sure you want to unlink this alias from the "production" dataset?',
      ),
      validate: expect.any(Function),
    })
  })

  test('unlinks alias with confirmation when alias name provided with ~ prefix', async () => {
    setupMockClient()
    mockInput.mockResolvedValueOnce('yes')

    const {stdout} = await testCommand(UnlinkAliasCommand, ['~staging'])

    expect(stdout).toContain('Dataset alias ~staging unlinked from production successfully')
    expect(mockInput).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'Are you ABSOLUTELY sure you want to unlink this alias from the "production" dataset?',
      ),
      validate: expect.any(Function),
    })
  })

  test('unlinks alias with force flag (skips confirmation)', async () => {
    setupMockClient()

    const {stderr, stdout} = await testCommand(UnlinkAliasCommand, ['staging', '--force'])

    expect(stdout).toContain('Dataset alias ~staging unlinked from production successfully')
    expect(stderr).toContain('\'--force\' used: skipping confirmation, unlinking alias "~staging"')
    expect(mockInput).not.toHaveBeenCalled()
  })

  test('prompts for alias name when no alias provided', async () => {
    setupMockClient()
    mockInput
      .mockResolvedValueOnce('staging') // alias name prompt
      .mockResolvedValueOnce('yes') // confirmation prompt

    const {stdout} = await testCommand(UnlinkAliasCommand, [])

    expect(stdout).toContain('Dataset alias ~staging unlinked from production successfully')
    expect(mockInput).toHaveBeenCalledWith({
      message: 'Alias name:',
      validate: expect.any(Function),
    })
  })

  test('shows error when no project ID available', async () => {
    mockGetCliConfig.mockResolvedValueOnce({})

    const {error} = await testCommand(UnlinkAliasCommand, ['staging'])

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when alias name is invalid', async () => {
    setupMockClient()

    const {error} = await testCommand(UnlinkAliasCommand, ['invalid-alias!'])

    expect(error?.message).toContain(
      'Alias name must only contain letters, numbers, dashes and underscores',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when alias does not exist', async () => {
    setupMockClient()

    const {error} = await testCommand(UnlinkAliasCommand, ['nonexistent'])

    expect(error?.message).toContain('Dataset alias "~nonexistent" does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when alias exists but is not linked', async () => {
    setupMockClient()

    const {error} = await testCommand(UnlinkAliasCommand, ['unlinked'])

    expect(error?.message).toContain('Dataset alias "~unlinked" is not linked to a dataset')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles user cancellation during confirmation', async () => {
    setupMockClient()
    mockInput.mockRejectedValueOnce(new Error('User cancelled'))

    const {error} = await testCommand(UnlinkAliasCommand, ['staging'])

    expect(error?.message).toContain('Dataset alias unlink failed: User cancelled')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API error during unlink', async () => {
    setupMockClient()
    mockInput.mockResolvedValueOnce('yes')

    const mockClient = {
      request: vi.fn(),
    }
    mockClient.request.mockImplementation((config) => {
      if (config.uri === '/aliases') {
        return Promise.resolve([{datasetName: 'production', name: 'staging'}])
      }
      if (config.uri?.includes('/unlink')) {
        return Promise.reject(new Error('API Error'))
      }
      return Promise.resolve({})
    })
    mockGetProjectCliClient.mockResolvedValue(mockClient as never)

    const {error} = await testCommand(UnlinkAliasCommand, ['staging'])

    expect(error?.message).toContain('Dataset alias unlink failed: API Error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

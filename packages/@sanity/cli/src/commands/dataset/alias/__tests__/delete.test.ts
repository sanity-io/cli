import {input} from '@inquirer/prompts'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../../util/errorMessages.js'
import {DeleteAliasCommand} from '../delete.js'

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
  aliases = [{datasetName: 'production', name: 'test-alias'}],
  deleteAliasResponse = {deleted: true},
}: {
  aliases?: Array<{datasetName: string | null; name: string}>
  deleteAliasResponse?: {deleted: boolean}
} = {}) => {
  const mockClient = {
    request: vi.fn(),
  }

  mockClient.request.mockImplementation((config) => {
    if (config.uri === '/aliases') {
      return Promise.resolve(aliases)
    }
    if (config.uri?.startsWith('/aliases/') && config.method === 'DELETE') {
      return Promise.resolve(deleteAliasResponse)
    }
    return Promise.resolve({})
  })

  mockGetProjectCliClient.mockResolvedValue(mockClient as never)
}

describe('dataset:alias:delete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('deletes alias with confirmation when alias name provided without ~ prefix', async () => {
    setupMockClient()
    mockInput.mockResolvedValueOnce('~test-alias')

    const {stdout} = await testCommand(DeleteAliasCommand, ['test-alias'])

    expect(stdout).toContain('Dataset alias deleted successfully')
    expect(mockInput).toHaveBeenCalledWith({
      message: expect.stringContaining('This dataset alias is linked to production'),
      validate: expect.any(Function),
    })
  })

  test('deletes alias with confirmation when alias name provided with ~ prefix', async () => {
    setupMockClient()
    mockInput.mockResolvedValueOnce('~test-alias')

    const {stdout} = await testCommand(DeleteAliasCommand, ['~test-alias'])

    expect(stdout).toContain('Dataset alias deleted successfully')
    expect(mockInput).toHaveBeenCalledWith({
      message: expect.stringContaining('This dataset alias is linked to production'),
      validate: expect.any(Function),
    })
  })

  test('deletes alias with force flag (skips confirmation)', async () => {
    setupMockClient()

    const {stderr, stdout} = await testCommand(DeleteAliasCommand, ['test-alias', '--force'])

    expect(stderr).toContain("'--force' used: skipping confirmation")
    expect(stdout).toContain('Dataset alias deleted successfully')
    expect(mockInput).not.toHaveBeenCalled()
  })

  test('deletes unlinked alias with confirmation (different prompt message)', async () => {
    setupMockClient({
      aliases: [{datasetName: null, name: 'test-alias'}],
    })
    mockInput.mockResolvedValueOnce('~test-alias')

    const {stdout} = await testCommand(DeleteAliasCommand, ['test-alias'])

    expect(stdout).toContain('Dataset alias deleted successfully')
    expect(mockInput).toHaveBeenCalledWith({
      message: expect.stringContaining('Are you ABSOLUTELY sure you want to delete'),
      validate: expect.any(Function),
    })
    expect(mockInput.mock.calls[0][0].message).not.toContain('linked to')
  })

  test('fails when alias does not exist', async () => {
    setupMockClient({
      aliases: [{datasetName: 'production', name: 'other-alias'}],
    })

    const {error} = await testCommand(DeleteAliasCommand, ['nonexistent'])

    expect(error?.message).toContain('Dataset alias "~nonexistent" does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails with invalid alias name', async () => {
    setupMockClient()

    const {error} = await testCommand(DeleteAliasCommand, ['a'])

    expect(error?.message).toContain('Alias name must be at least two characters long')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when no project ID available', async () => {
    mockGetCliConfig.mockResolvedValueOnce({
      api: {},
    })

    const {error} = await testCommand(DeleteAliasCommand, ['test-alias'])

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API errors gracefully', async () => {
    const mockClient = {
      request: vi.fn(),
    }

    mockClient.request.mockImplementation((config) => {
      if (config.uri === '/aliases') {
        return Promise.resolve([{datasetName: 'production', name: 'test-alias'}])
      }
      if (config.uri?.startsWith('/aliases/') && config.method === 'DELETE') {
        return Promise.reject(new Error('API Error: Network timeout'))
      }
      return Promise.resolve({})
    })

    mockGetProjectCliClient.mockResolvedValue(mockClient as never)
    mockInput.mockResolvedValueOnce('~test-alias')

    const {error} = await testCommand(DeleteAliasCommand, ['test-alias'])

    expect(error?.message).toContain('Dataset alias deletion failed: API Error: Network timeout')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('confirmation validation works correctly', async () => {
    setupMockClient()
    mockInput.mockResolvedValueOnce('~test-alias')

    await testCommand(DeleteAliasCommand, ['test-alias'])

    expect(mockInput).toHaveBeenCalled()

    const validateFn = mockInput.mock.calls[0]?.[0]?.validate
    if (validateFn) {
      expect(validateFn('~test-alias')).toBe(true)
      expect(validateFn('wrong-name')).toBe(
        'Incorrect dataset alias name. Ctrl + C to cancel delete.',
      )
      expect(validateFn('  ~test-alias  ')).toBe(true)
    }
  })
})

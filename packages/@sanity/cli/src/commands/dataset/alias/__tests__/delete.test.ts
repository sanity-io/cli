import {input} from '@inquirer/prompts'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DATASET_ALIASES_API_VERSION} from '../../../../services/datasetAliases.js'
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

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
}))

const mockGetCliConfig = vi.mocked(getCliConfig)
const mockInput = vi.mocked(input)

describe('dataset:alias:delete', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test.each([
    ['test-alias', 'without ~ prefix'],
    ['~test-alias', 'with ~ prefix'],
  ])('deletes alias with confirmation: %s (%s)', async (aliasInput) => {
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [{datasetName: 'production', name: 'test-alias'}])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'delete',
      uri: '/aliases/test-alias',
    }).reply(200, {deleted: true})

    mockInput.mockResolvedValueOnce('~test-alias')

    const {stdout} = await testCommand(DeleteAliasCommand, [aliasInput])

    expect(stdout).toContain('Dataset alias deleted successfully')
    expect(mockInput).toHaveBeenCalledWith({
      message: expect.stringContaining('This dataset alias is linked to production'),
      validate: expect.any(Function),
    })
  })

  test('deletes alias with force flag (skips confirmation)', async () => {
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [{datasetName: 'production', name: 'test-alias'}])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'delete',
      uri: '/aliases/test-alias',
    }).reply(200, {deleted: true})

    const {stderr, stdout} = await testCommand(DeleteAliasCommand, ['test-alias', '--force'])

    expect(stderr).toContain("'--force' used: skipping confirmation")
    expect(stdout).toContain('Dataset alias deleted successfully')
    expect(mockInput).not.toHaveBeenCalled()
  })

  test('deletes unlinked alias with confirmation (different prompt message)', async () => {
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [{datasetName: null, name: 'test-alias'}])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'delete',
      uri: '/aliases/test-alias',
    }).reply(200, {deleted: true})

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
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [{datasetName: 'production', name: 'other-alias'}])

    const {error} = await testCommand(DeleteAliasCommand, ['nonexistent'])

    expect(error?.message).toContain('Dataset alias "~nonexistent" does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails with invalid alias name', async () => {
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
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [{datasetName: 'production', name: 'test-alias'}])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'delete',
      uri: '/aliases/test-alias',
    }).reply(500, {message: 'API Error: Network timeout'})

    mockInput.mockResolvedValueOnce('~test-alias')

    const {error} = await testCommand(DeleteAliasCommand, ['test-alias'])

    expect(error?.message).toContain('Dataset alias deletion failed: API Error: Network timeout')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('validation works correctly', async () => {
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [{datasetName: 'production', name: 'test-alias'}])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'delete',
      uri: '/aliases/test-alias',
    }).reply(200, {deleted: true})

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

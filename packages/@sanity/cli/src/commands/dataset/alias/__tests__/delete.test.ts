import {runCommand} from '@oclif/test'
import {input} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DATASET_ALIASES_API_VERSION} from '../../../../services/datasetAliases.js'
import {NO_PROJECT_ID} from '../../../../util/errorMessages.js'
import {DeleteAliasCommand} from '../delete.js'

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: vi.fn(),
  }
})

const testProjectId = 'test-project'

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const mockInput = vi.mocked(input)

describe('#dataset:alias:delete', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('help works correctly', async () => {
    const {stdout} = await runCommand(['dataset', 'alias', 'delete', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "Delete a dataset alias within your project

      USAGE
        $ sanity dataset alias delete ALIASNAME [--force]

      ARGUMENTS
        ALIASNAME  Dataset alias name to delete

      FLAGS
        --force  Skip confirmation prompt and delete immediately

      DESCRIPTION
        Delete a dataset alias within your project

      EXAMPLES
        Delete alias named "conference" with confirmation prompt

          $ sanity dataset alias delete conference

        Delete alias with explicit ~ prefix

          $ sanity dataset alias delete ~conference

        Delete alias named "conference" without confirmation prompt

          $ sanity dataset alias delete conference --force

      "
    `)
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

    const {stdout} = await testCommand(DeleteAliasCommand, [aliasInput], {mocks: defaultMocks})

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

    const {stderr, stdout} = await testCommand(DeleteAliasCommand, ['test-alias', '--force'], {
      mocks: defaultMocks,
    })

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

    const {stdout} = await testCommand(DeleteAliasCommand, ['test-alias'], {mocks: defaultMocks})

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

    const {error} = await testCommand(DeleteAliasCommand, ['nonexistent'], {mocks: defaultMocks})

    expect(error?.message).toContain('Dataset alias "~nonexistent" does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails with invalid alias name', async () => {
    const {error} = await testCommand(DeleteAliasCommand, ['a'], {mocks: defaultMocks})

    expect(error?.message).toContain('Alias name must be at least two characters long')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('fails when no project ID available', async () => {
    const {error} = await testCommand(DeleteAliasCommand, ['test-alias'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {}},
      },
    })

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

    const {error} = await testCommand(DeleteAliasCommand, ['test-alias'], {mocks: defaultMocks})

    expect(error?.message).toContain('Dataset alias deletion failed: API Error: Network timeout')
    expect(error?.oclif?.exit).toBe(1)
  })
})

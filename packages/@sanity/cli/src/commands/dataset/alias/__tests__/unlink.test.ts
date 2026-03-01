import {NonInteractiveError} from '@sanity/cli-core'
import {input} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DATASET_ALIASES_API_VERSION} from '../../../../services/datasetAliases.js'
import {UnlinkAliasCommand} from '../unlink.js'

vi.mock('../../../../prompts/promptForProject.js', () => ({
  promptForProject: vi.fn().mockRejectedValue(new NonInteractiveError('select')),
}))

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

describe('#dataset:alias:unlink', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test.each([
    ['staging', 'without ~ prefix'],
    ['~staging', 'with ~ prefix'],
  ])('unlinks alias with confirmation: %s (%s)', async (aliasInput) => {
    mockApi({
      apiVersion: DATASET_ALIASES_API_VERSION,
      projectId: testProjectId,
      uri: '/aliases',
    }).reply(200, [
      {datasetName: 'production', name: 'staging'},
      {datasetName: null, name: 'unlinked'},
    ])

    mockApi({
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'patch',
      projectId: testProjectId,
      uri: '/aliases/staging/unlink',
    }).reply(200, {aliasName: 'staging', datasetName: 'production'})

    mockInput.mockResolvedValueOnce('yes')

    const {stdout} = await testCommand(UnlinkAliasCommand, [aliasInput], {mocks: defaultMocks})

    expect(stdout).toContain('Dataset alias ~staging unlinked from production successfully')
    expect(mockInput).toHaveBeenCalledWith({
      message: expect.stringContaining(
        'Are you ABSOLUTELY sure you want to unlink this alias from the "production" dataset?',
      ),
      validate: expect.any(Function),
    })
  })

  test('unlinks alias with force flag (skips confirmation)', async () => {
    mockApi({
      apiVersion: DATASET_ALIASES_API_VERSION,
      projectId: testProjectId,
      uri: '/aliases',
    }).reply(200, [
      {datasetName: 'production', name: 'staging'},
      {datasetName: null, name: 'unlinked'},
    ])

    mockApi({
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'patch',
      projectId: testProjectId,
      uri: '/aliases/staging/unlink',
    }).reply(200, {aliasName: 'staging', datasetName: 'production'})

    const {stderr, stdout} = await testCommand(UnlinkAliasCommand, ['staging', '--force'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Dataset alias ~staging unlinked from production successfully')
    expect(stderr).toContain('\'--force\' used: skipping confirmation, unlinking alias "~staging"')
    expect(mockInput).not.toHaveBeenCalled()
  })

  test('prompts for alias name when no alias provided', async () => {
    mockApi({
      apiVersion: DATASET_ALIASES_API_VERSION,
      projectId: testProjectId,
      uri: '/aliases',
    }).reply(200, [
      {datasetName: 'production', name: 'staging'},
      {datasetName: null, name: 'unlinked'},
    ])

    mockApi({
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'patch',
      projectId: testProjectId,
      uri: '/aliases/staging/unlink',
    }).reply(200, {aliasName: 'staging', datasetName: 'production'})

    mockInput
      .mockResolvedValueOnce('staging') // alias name prompt
      .mockResolvedValueOnce('yes') // confirmation prompt

    const {stdout} = await testCommand(UnlinkAliasCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Dataset alias ~staging unlinked from production successfully')
    expect(mockInput).toHaveBeenCalledWith({
      message: 'Alias name:',
      validate: expect.any(Function),
    })
  })

  test('handles user cancellation during confirmation', async () => {
    mockApi({
      apiVersion: DATASET_ALIASES_API_VERSION,
      projectId: testProjectId,
      uri: '/aliases',
    }).reply(200, [
      {datasetName: 'production', name: 'staging'},
      {datasetName: null, name: 'unlinked'},
    ])

    mockInput.mockRejectedValueOnce(new Error('User cancelled'))

    const {error} = await testCommand(UnlinkAliasCommand, ['staging'], {mocks: defaultMocks})

    expect(error?.message).toContain('Dataset alias unlink failed: User cancelled')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when no project ID available', async () => {
    const {error} = await testCommand(UnlinkAliasCommand, ['staging'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {},
      },
    })

    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when alias name is invalid', async () => {
    const {error} = await testCommand(UnlinkAliasCommand, ['invalid-alias!'], {mocks: defaultMocks})

    expect(error?.message).toContain(
      'Alias name must only contain letters, numbers, dashes and underscores',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when alias does not exist', async () => {
    mockApi({
      apiVersion: DATASET_ALIASES_API_VERSION,
      projectId: testProjectId,
      uri: '/aliases',
    }).reply(200, [
      {datasetName: 'production', name: 'staging'},
      {datasetName: null, name: 'unlinked'},
    ])

    const {error} = await testCommand(UnlinkAliasCommand, ['nonexistent'], {mocks: defaultMocks})

    expect(error?.message).toContain('Dataset alias "~nonexistent" does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when alias exists but is not linked', async () => {
    mockApi({
      apiVersion: DATASET_ALIASES_API_VERSION,
      projectId: testProjectId,
      uri: '/aliases',
    }).reply(200, [
      {datasetName: 'production', name: 'staging'},
      {datasetName: null, name: 'unlinked'},
    ])

    const {error} = await testCommand(UnlinkAliasCommand, ['unlinked'], {mocks: defaultMocks})

    expect(error?.message).toContain('Dataset alias "~unlinked" is not linked to a dataset')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API error during unlink', async () => {
    mockApi({
      apiVersion: DATASET_ALIASES_API_VERSION,
      projectId: testProjectId,
      uri: '/aliases',
    }).reply(200, [{datasetName: 'production', name: 'staging'}])

    mockApi({
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'patch',
      projectId: testProjectId,
      uri: '/aliases/staging/unlink',
    }).reply(500, {message: 'API Error'})

    mockInput.mockResolvedValueOnce('yes')

    const {error} = await testCommand(UnlinkAliasCommand, ['staging'], {mocks: defaultMocks})

    expect(error?.message).toContain('Dataset alias unlink failed: API Error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

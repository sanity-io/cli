import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {input} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DATASET_ALIASES_API_VERSION} from '../../../../services/datasetAliases.js'
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

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: vi.fn(),
  }
})

const mockGetCliConfig = vi.mocked(getCliConfig)
const mockInput = vi.mocked(input)

describe('#dataset:alias:unlink', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('help works correctly', async () => {
    const {stdout} = await runCommand(['dataset alias unlink', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "Unlink a dataset alias from its dataset within your project

      USAGE
        $ sanity dataset alias unlink [ALIASNAME] [--force]

      ARGUMENTS
        [ALIASNAME]  Dataset alias name to unlink

      FLAGS
        --force  Skip confirmation prompt and unlink immediately

      DESCRIPTION
        Unlink a dataset alias from its dataset within your project

      EXAMPLES
        Unlink an alias with interactive selection

          $ sanity dataset alias unlink

        Unlink alias "conference" with confirmation prompt

          $ sanity dataset alias unlink conference

        Unlink alias with explicit ~ prefix

          $ sanity dataset alias unlink ~conference

        Unlink alias "conference" without confirmation prompt

          $ sanity dataset alias unlink conference --force

      "
    `)
  })

  test.each([
    ['staging', 'without ~ prefix'],
    ['~staging', 'with ~ prefix'],
  ])('unlinks alias with confirmation: %s (%s)', async (aliasInput) => {
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [
      {datasetName: 'production', name: 'staging'},
      {datasetName: null, name: 'unlinked'},
    ])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'patch',
      uri: '/aliases/staging/unlink',
    }).reply(200, {aliasName: 'staging', datasetName: 'production'})

    mockInput.mockResolvedValueOnce('yes')

    const {stdout} = await testCommand(UnlinkAliasCommand, [aliasInput])

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
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [
      {datasetName: 'production', name: 'staging'},
      {datasetName: null, name: 'unlinked'},
    ])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'patch',
      uri: '/aliases/staging/unlink',
    }).reply(200, {aliasName: 'staging', datasetName: 'production'})

    const {stderr, stdout} = await testCommand(UnlinkAliasCommand, ['staging', '--force'])

    expect(stdout).toContain('Dataset alias ~staging unlinked from production successfully')
    expect(stderr).toContain('\'--force\' used: skipping confirmation, unlinking alias "~staging"')
    expect(mockInput).not.toHaveBeenCalled()
  })

  test('prompts for alias name when no alias provided', async () => {
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [
      {datasetName: 'production', name: 'staging'},
      {datasetName: null, name: 'unlinked'},
    ])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'patch',
      uri: '/aliases/staging/unlink',
    }).reply(200, {aliasName: 'staging', datasetName: 'production'})

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

  test('handles user cancellation during confirmation', async () => {
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [
      {datasetName: 'production', name: 'staging'},
      {datasetName: null, name: 'unlinked'},
    ])

    mockInput.mockRejectedValueOnce(new Error('User cancelled'))

    const {error} = await testCommand(UnlinkAliasCommand, ['staging'])

    expect(error?.message).toContain('Dataset alias unlink failed: User cancelled')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when no project ID available', async () => {
    mockGetCliConfig.mockResolvedValueOnce({})

    const {error} = await testCommand(UnlinkAliasCommand, ['staging'])

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when alias name is invalid', async () => {
    const {error} = await testCommand(UnlinkAliasCommand, ['invalid-alias!'])

    expect(error?.message).toContain(
      'Alias name must only contain letters, numbers, dashes and underscores',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when alias does not exist', async () => {
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [
      {datasetName: 'production', name: 'staging'},
      {datasetName: null, name: 'unlinked'},
    ])

    const {error} = await testCommand(UnlinkAliasCommand, ['nonexistent'])

    expect(error?.message).toContain('Dataset alias "~nonexistent" does not exist')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when alias exists but is not linked', async () => {
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [
      {datasetName: 'production', name: 'staging'},
      {datasetName: null, name: 'unlinked'},
    ])

    const {error} = await testCommand(UnlinkAliasCommand, ['unlinked'])

    expect(error?.message).toContain('Dataset alias "~unlinked" is not linked to a dataset')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API error during unlink', async () => {
    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      uri: '/aliases',
    }).reply(200, [{datasetName: 'production', name: 'staging'}])

    mockApi({
      apiHost: 'https://test-project.api.sanity.io',
      apiVersion: DATASET_ALIASES_API_VERSION,
      method: 'patch',
      uri: '/aliases/staging/unlink',
    }).reply(500, {message: 'API Error'})

    mockInput.mockResolvedValueOnce('yes')

    const {error} = await testCommand(UnlinkAliasCommand, ['staging'])

    expect(error?.message).toContain('Dataset alias unlink failed: API Error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

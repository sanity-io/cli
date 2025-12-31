import {runCommand} from '@oclif/test'
import {select} from '@sanity/cli-core/ux'
import {mockApi, mockClient, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {BACKUP_API_VERSION} from '../../../actions/backup/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {DisableBackupCommand} from '../disable.js'

const mockListDatasets = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue(
      mockClient({
        datasets: {
          list: mockListDatasets,
        } as never,
      }),
    ),
  }
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    select: vi.fn(),
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

const mockSelect = vi.mocked(select)

describe('#backup:disable', () => {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    vi.clearAllMocks()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['backup disable', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "Disable backup for a dataset.

      USAGE
        $ sanity backup disable [DATASET]

      ARGUMENTS
        [DATASET]  Dataset name to disable backup for

      DESCRIPTION
        Disable backup for a dataset.

      EXAMPLES
        Interactively disable backup for a dataset

          $ sanity backup disable

        Disable backup for the production dataset

          $ sanity backup disable production

      "
    `)
  })

  test('should disable backup for specified dataset', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: `/projects/${testProjectId}/datasets/production/settings/backups`,
    }).reply(200, {enabled: false})

    const {stdout} = await testCommand(DisableBackupCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Disabled daily backups for dataset production')
  })

  test('should prompt for dataset when none specified', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: `/projects/${testProjectId}/datasets/production/settings/backups`,
    }).reply(200, {enabled: false})

    mockSelect.mockResolvedValue('production')

    const {stdout} = await testCommand(DisableBackupCommand, [], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Disabled daily backups for dataset production')
    expect(mockSelect).toHaveBeenCalledWith({
      choices: [
        {name: 'production', value: 'production'},
        {name: 'staging', value: 'staging'},
      ],
      message: 'Select the dataset name:',
    })
  })

  test('should fail when no project ID is available', async () => {
    const {error} = await testCommand(DisableBackupCommand, ['production'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: undefined},
      },
    })

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle API errors gracefully', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: `/projects/${testProjectId}/datasets/production/settings/backups`,
    }).reply(500, 'API request failed')

    const {error} = await testCommand(DisableBackupCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Disabling dataset backup failed:')
    expect(error?.message).toContain('API request failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when no datasets are available', async () => {
    mockListDatasets.mockResolvedValue([])

    const {error} = await testCommand(DisableBackupCommand, [], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('No datasets found in this project')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle dataset list fetch errors', async () => {
    mockListDatasets.mockRejectedValue(new Error('Failed to fetch datasets'))

    const {error} = await testCommand(DisableBackupCommand, [], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Failed to list datasets: Failed to fetch datasets')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when specified dataset does not exist', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

    const {error} = await testCommand(DisableBackupCommand, ['nonexistent'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain("Dataset 'nonexistent' not found")
    expect(error?.message).toContain('Available datasets: production, staging')
    expect(error?.oclif?.exit).toBe(1)
  })
})

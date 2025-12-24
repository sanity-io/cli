import {select} from '@sanity/cli-core/ux'
import {runCommand} from '@oclif/test'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {BACKUP_API_VERSION} from '../../../actions/backup/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {DisableBackupCommand} from '../disable.js'

vi.mock('@sanity/cli-core/ux', () => ({
  select: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock(import('../../../../../cli-core/src/services/apiClient.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getProjectCliClient: vi.fn(),
  }
})

const mockGetCliConfig = vi.mocked(getCliConfig)
const mockSelect = vi.mocked(select)
const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

const setupMocksWithDatasets = (datasets = [{name: 'production'}, {name: 'staging'}]) => {
  mockGetProjectCliClient.mockResolvedValue({
    datasets: {
      list: vi.fn().mockResolvedValue(datasets),
    },
  } as never)
}

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
    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/settings/backups',
    }).reply(200, {enabled: false})

    setupMocksWithDatasets([{name: 'production'}])

    const {stdout} = await testCommand(DisableBackupCommand, ['production'])

    expect(stdout).toContain('Disabled daily backups for dataset production')
  })

  test('should prompt for dataset when none specified', async () => {
    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/settings/backups',
    }).reply(200, {enabled: false})

    setupMocksWithDatasets([{name: 'production'}, {name: 'staging'}])
    mockSelect.mockResolvedValue('production')

    const {stdout} = await testCommand(DisableBackupCommand, [])

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
    mockGetCliConfig.mockResolvedValueOnce({
      api: undefined,
    })

    const {error} = await testCommand(DisableBackupCommand, ['production'])

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle API errors gracefully', async () => {
    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/settings/backups',
    }).reply(500, 'API request failed')

    setupMocksWithDatasets([{name: 'production'}])

    const {error} = await testCommand(DisableBackupCommand, ['production'])

    expect(error?.message).toContain('Disabling dataset backup failed:')
    expect(error?.message).toContain('API request failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when no datasets are available', async () => {
    setupMocksWithDatasets([])

    const {error} = await testCommand(DisableBackupCommand, [])

    expect(error?.message).toContain('No datasets found in this project')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle dataset list fetch errors', async () => {
    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        list: vi.fn().mockRejectedValue(new Error('Failed to fetch datasets')),
      },
    } as never)

    const {error} = await testCommand(DisableBackupCommand, [])

    expect(error?.message).toContain('Failed to list datasets: Failed to fetch datasets')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when specified dataset does not exist', async () => {
    setupMocksWithDatasets([{name: 'production'}, {name: 'staging'}])

    const {error} = await testCommand(DisableBackupCommand, ['nonexistent'])

    expect(error?.message).toContain("Dataset 'nonexistent' not found")
    expect(error?.message).toContain('Available datasets: production, staging')
    expect(error?.oclif?.exit).toBe(1)
  })
})

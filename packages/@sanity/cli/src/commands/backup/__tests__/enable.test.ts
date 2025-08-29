import {input, select} from '@inquirer/prompts'
import {runCommand} from '@oclif/test'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {BACKUP_API_VERSION} from '../../../actions/backup/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {EnableBackupCommand} from '../enable.js'

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
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
const mockInput = vi.mocked(input)
const mockSelect = vi.mocked(select)
const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

const setupMocksWithDatasets = (datasets = [{name: 'production'}, {name: 'staging'}]) => {
  mockGetProjectCliClient.mockResolvedValue({
    datasets: {
      create: vi.fn().mockResolvedValue({name: 'new-dataset'}),
      list: vi.fn().mockResolvedValue(datasets),
    },
  } as never)
}

describe('#backup:enable', () => {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    vi.clearAllMocks()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['backup enable', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "Enable backup for a dataset.

      USAGE
        $ sanity backup enable [DATASET]

      ARGUMENTS
        DATASET  Dataset name to enable backup for

      DESCRIPTION
        Enable backup for a dataset.

      EXAMPLES
        Interactively enable backup for a dataset

          $ sanity backup enable

        Enable backup for the production dataset

          $ sanity backup enable production

      "
    `)
  })

  test('should enable backup for specified dataset', async () => {
    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/settings/backups',
    }).reply(200, {enabled: true})

    setupMocksWithDatasets([{name: 'production'}])

    const {stdout} = await testCommand(EnableBackupCommand, ['production'])

    expect(stdout).toContain('Enabled backups for dataset production')
    expect(stdout).toContain('it may take up to 24 hours')
    expect(stdout).toContain('Retention policies may apply')
  })

  test('should prompt for dataset when none specified', async () => {
    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/production/settings/backups',
    }).reply(200, {enabled: true})

    setupMocksWithDatasets([{name: 'production'}, {name: 'staging'}])
    mockSelect.mockResolvedValue('production')

    const {stdout} = await testCommand(EnableBackupCommand, [])

    expect(stdout).toContain('Enabled backups for dataset production')
    expect(mockSelect).toHaveBeenCalledWith({
      choices: [
        {name: 'Create new dataset', value: 'new'},
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

    const {error} = await testCommand(EnableBackupCommand, ['production'])

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

    const {error} = await testCommand(EnableBackupCommand, ['production'])

    expect(error?.message).toContain('Enabling dataset backup failed:')
    expect(error?.message).toContain('API request failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when no datasets are available', async () => {
    setupMocksWithDatasets([])

    const {error} = await testCommand(EnableBackupCommand, [])

    expect(error?.message).toContain('No datasets found in this project')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle dataset list fetch errors', async () => {
    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        list: vi.fn().mockRejectedValue(new Error('Failed to fetch datasets')),
      },
    } as never)

    const {error} = await testCommand(EnableBackupCommand, [])

    expect(error?.message).toContain('Failed to list datasets: Failed to fetch datasets')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should create new dataset and enable backup when "new" is selected', async () => {
    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/new-dataset/settings/backups',
    }).reply(200, {enabled: true})

    const mockCreate = vi.fn().mockResolvedValue({name: 'new-dataset'})

    // First call is from listDatasets for listing datasets
    mockGetProjectCliClient.mockResolvedValueOnce({
      datasets: {
        list: vi.fn().mockResolvedValue([{name: 'production'}]),
      },
    } as never)

    // Second call is for creating the new dataset
    mockGetProjectCliClient.mockResolvedValueOnce({
      datasets: {
        create: mockCreate,
      },
    } as never)

    mockSelect.mockResolvedValue('new')
    mockInput.mockResolvedValue('new-dataset')

    const {stdout} = await testCommand(EnableBackupCommand, [])

    expect(mockCreate).toHaveBeenCalledWith('new-dataset')
    expect(stdout).toContain('Enabled backups for dataset new-dataset')
    expect(mockInput).toHaveBeenCalledWith({
      default: 'production',
      message: 'Dataset name:',
      validate: expect.any(Function),
    })
  })

  test('should handle dataset creation failure', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('Dataset creation failed'))

    // First call is from listDatasets for listing datasets
    mockGetProjectCliClient.mockResolvedValueOnce({
      datasets: {
        list: vi.fn().mockResolvedValue([{name: 'production'}]),
      },
    } as never)

    // Second call is for creating the new dataset (which fails)
    mockGetProjectCliClient.mockResolvedValueOnce({
      datasets: {
        create: mockCreate,
      },
    } as never)

    mockSelect.mockResolvedValue('new')
    mockInput.mockResolvedValue('invalid-dataset')

    const {error} = await testCommand(EnableBackupCommand, [])

    expect(error?.message).toContain(
      'Failed to create dataset invalid-dataset: Dataset creation failed',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should prompt for dataset name with validation when creating new dataset', async () => {
    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: '/projects/test-project/datasets/valid-dataset/settings/backups',
    }).reply(200, {enabled: true})

    const mockCreate = vi.fn().mockResolvedValue({name: 'valid-dataset'})

    // First call is from listDatasets for listing datasets
    mockGetProjectCliClient.mockResolvedValueOnce({
      datasets: {
        list: vi.fn().mockResolvedValue([{name: 'staging'}]),
      },
    } as never)

    // Second call is for creating the new dataset
    mockGetProjectCliClient.mockResolvedValueOnce({
      datasets: {
        create: mockCreate,
      },
    } as never)

    mockSelect.mockResolvedValue('new')
    mockInput.mockResolvedValue('valid-dataset')

    const {stdout} = await testCommand(EnableBackupCommand, [])

    expect(stdout).toContain('Enabled backups for dataset valid-dataset')
    expect(mockInput).toHaveBeenCalledWith({
      default: undefined,
      message: 'Dataset name:',
      validate: expect.any(Function),
    })
  })

  test('should fail when specified dataset does not exist', async () => {
    setupMocksWithDatasets([{name: 'production'}, {name: 'staging'}])

    const {error} = await testCommand(EnableBackupCommand, ['nonexistent'])

    expect(error?.message).toContain("Dataset 'nonexistent' not found...")
    expect(error?.oclif?.exit).toBe(1)
  })
})

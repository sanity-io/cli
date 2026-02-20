import {input, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {BACKUP_API_VERSION} from '../../../actions/backup/constants.js'
import {NEW_DATASET_VALUE} from '../../../prompts/promptForDataset.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {EnableBackupCommand} from '../enable.js'

const mockListDatasets = vi.hoisted(() => vi.fn())
const mockCreateDataset = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        create: mockCreateDataset,
        list: mockListDatasets,
      } as never,
    }),
  }
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: vi.fn(),
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

const mockInput = vi.mocked(input)
const mockSelect = vi.mocked(select)

describe('#backup:enable', () => {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    vi.clearAllMocks()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('should enable backup for specified dataset', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: `/projects/${testProjectId}/datasets/production/settings/backups`,
    }).reply(200, {enabled: true})

    const {stdout} = await testCommand(EnableBackupCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Enabled backups for dataset production')
    expect(stdout).toContain('it may take up to 24 hours')
    expect(stdout).toContain('Retention policies may apply')
  })

  test('should prompt for dataset when none specified', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: `/projects/${testProjectId}/datasets/production/settings/backups`,
    }).reply(200, {enabled: true})

    mockSelect.mockResolvedValue('production')

    const {stdout} = await testCommand(EnableBackupCommand, [], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Enabled backups for dataset production')
    expect(mockSelect).toHaveBeenCalledWith({
      choices: [
        {name: 'Create new dataset', value: NEW_DATASET_VALUE},
        {name: 'production', value: 'production'},
        {name: 'staging', value: 'staging'},
      ],
      message: 'Select the dataset name:',
    })
  })

  test('should fail when no project ID is available', async () => {
    const {error} = await testCommand(EnableBackupCommand, ['production'], {
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

    const {error} = await testCommand(EnableBackupCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Enabling dataset backup failed:')
    expect(error?.message).toContain('API request failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when no datasets are available', async () => {
    mockListDatasets.mockResolvedValue([])

    const {error} = await testCommand(EnableBackupCommand, [], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('No datasets found in this project')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle dataset list fetch errors', async () => {
    mockListDatasets.mockRejectedValue(new Error('Failed to fetch datasets'))

    const {error} = await testCommand(EnableBackupCommand, [], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Failed to list datasets: Failed to fetch datasets')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should create new dataset and enable backup when "new" is selected', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])
    mockCreateDataset.mockResolvedValue({name: 'new-dataset'})

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: `/projects/${testProjectId}/datasets/new-dataset/settings/backups`,
    }).reply(200, {enabled: true})

    mockSelect.mockResolvedValue(NEW_DATASET_VALUE)
    mockInput.mockResolvedValue('new-dataset')

    const {stdout} = await testCommand(EnableBackupCommand, [], {
      mocks: defaultMocks,
    })

    expect(mockCreateDataset).toHaveBeenCalledWith('new-dataset', {})
    expect(stdout).toContain('Enabled backups for dataset new-dataset')
    expect(mockInput).toHaveBeenCalledWith({
      default: undefined,
      message: 'Dataset name:',
      validate: expect.any(Function),
    })
  })

  test('should handle dataset creation failure', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])
    mockCreateDataset.mockRejectedValue(new Error('Dataset creation failed'))

    mockSelect.mockResolvedValue(NEW_DATASET_VALUE)
    mockInput.mockResolvedValue('invalid-dataset')

    const {error} = await testCommand(EnableBackupCommand, [], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain(
      'Failed to create dataset invalid-dataset: Dataset creation failed',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should prompt for dataset name with validation when creating new dataset', async () => {
    mockListDatasets.mockResolvedValue([{name: 'staging'}])
    mockCreateDataset.mockResolvedValue({name: 'valid-dataset'})

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'put',
      uri: `/projects/${testProjectId}/datasets/valid-dataset/settings/backups`,
    }).reply(200, {enabled: true})

    mockSelect.mockResolvedValue(NEW_DATASET_VALUE)
    mockInput.mockResolvedValue('valid-dataset')

    const {stdout} = await testCommand(EnableBackupCommand, [], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Enabled backups for dataset valid-dataset')
    expect(mockInput).toHaveBeenCalledWith({
      default: 'production',
      message: 'Dataset name:',
      validate: expect.any(Function),
    })
  })

  test('should fail when specified dataset does not exist', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

    const {error} = await testCommand(EnableBackupCommand, ['nonexistent'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain(
      "Dataset 'nonexistent' not found in this project. Available datasets: production, staging",
    )
    expect(error?.oclif?.exit).toBe(1)
  })
})

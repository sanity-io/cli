import {select} from '@sanity/cli-core/ux'
import {runCommand} from '@oclif/test'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {BACKUP_API_VERSION} from '../../../actions/backup/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {ListBackupCommand} from '../list.js'

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

const backupsResponse = {
  backups: [
    {
      createdAt: '2024-01-15T10:30:00Z',
      id: 'backup-1',
    },
    {
      createdAt: '2024-01-14T09:20:00Z',
      id: 'backup-2',
    },
  ],
}

describe('#backup:list', () => {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    vi.clearAllMocks()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['backup:list', '--help'])
    expect(stdout).toContain('List available backups for a dataset')
    expect(stdout).toContain('USAGE')
    expect(stdout).toContain('EXAMPLES')
  })

  test('should fail when no project ID is configured', async () => {
    mockGetCliConfig.mockResolvedValueOnce({api: {}})

    const {error} = await testCommand(ListBackupCommand, [])
    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when no datasets exist', async () => {
    setupMocksWithDatasets([])

    const {error} = await testCommand(ListBackupCommand, [])
    expect(error?.message).toBe('No datasets found in this project.')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should list backups for a specified dataset', async () => {
    setupMocksWithDatasets([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'get',
      query: {limit: '30'},
      uri: '/projects/test-project/datasets/production/backups',
    }).reply(200, backupsResponse)

    const {stdout} = await testCommand(ListBackupCommand, ['production'])

    expect(stdout).toContain('RESOURCE')
    expect(stdout).toContain('CREATED AT')
    expect(stdout).toContain('BACKUP ID')
    expect(stdout).toContain('Dataset')
    expect(stdout).toContain('backup-1')
    expect(stdout).toContain('backup-2')
  })

  test('should list backups with custom limit', async () => {
    setupMocksWithDatasets([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'get',
      query: {limit: '50'},
      uri: '/projects/test-project/datasets/production/backups',
    }).reply(200, backupsResponse)

    const {stdout} = await testCommand(ListBackupCommand, ['production', '--limit', '50'])

    expect(stdout).toContain('backup-1')
    expect(stdout).toContain('backup-2')
  })

  test('should list backups with date filters', async () => {
    setupMocksWithDatasets([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'get',
      query: {after: '2024-01-01', before: '2024-01-31', limit: '30'},
      uri: '/projects/test-project/datasets/production/backups',
    }).reply(200, backupsResponse)

    const {stdout} = await testCommand(ListBackupCommand, [
      'production',
      '--after',
      '2024-01-01',
      '--before',
      '2024-01-31',
    ])

    expect(stdout).toContain('backup-1')
    expect(stdout).toContain('backup-2')
  })

  test('should show message when no backups found', async () => {
    setupMocksWithDatasets([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'get',
      query: {limit: '30'},
      uri: '/projects/test-project/datasets/production/backups',
    }).reply(200, {backups: []})

    const {stdout} = await testCommand(ListBackupCommand, ['production'])

    expect(stdout).toContain('No backups found.')
  })

  test('should prompt for dataset selection when no dataset is specified', async () => {
    setupMocksWithDatasets([{name: 'production'}, {name: 'staging'}])
    mockSelect.mockResolvedValueOnce('staging')

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'get',
      query: {limit: '30'},
      uri: '/projects/test-project/datasets/staging/backups',
    }).reply(200, backupsResponse)

    const {stdout} = await testCommand(ListBackupCommand, [])

    expect(mockSelect).toHaveBeenCalledWith({
      choices: [
        {name: 'production', value: 'production'},
        {name: 'staging', value: 'staging'},
      ],
      message: 'Select the dataset name:',
    })
    expect(stdout).toContain('backup-1')
  })

  test('should fail with invalid date format', async () => {
    setupMocksWithDatasets([{name: 'production'}])

    const {error} = await testCommand(ListBackupCommand, ['production', '--after', 'invalid-date'])
    expect(error?.message).toContain("Invalid date format for '--after' flag")
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when after date is after before date', async () => {
    setupMocksWithDatasets([{name: 'production'}])

    const {error} = await testCommand(ListBackupCommand, [
      'production',
      '--after',
      '2024-01-31',
      '--before',
      '2024-01-01',
    ])
    expect(error?.message).toBe('Parsing date flags: --after date must be before --before')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail with invalid limit', async () => {
    setupMocksWithDatasets([{name: 'production'}])

    const {error} = await testCommand(ListBackupCommand, ['production', '--limit', '0'])
    expect(error?.message).toContain('must be an integer between 1 and')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when dataset does not exist', async () => {
    setupMocksWithDatasets([{name: 'production'}, {name: 'staging'}])

    const {error} = await testCommand(ListBackupCommand, ['nonexistent'])
    expect(error?.message).toContain('Dataset')
    expect(error?.message).toContain('not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle API errors', async () => {
    setupMocksWithDatasets([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'get',
      query: {limit: '30'},
      uri: '/projects/test-project/datasets/production/backups',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(ListBackupCommand, ['production'])
    expect(error?.message).toContain('List dataset backup failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle failed dataset listing', async () => {
    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        list: vi.fn().mockRejectedValue(new Error('Server Error')),
      },
    } as never)

    const {error} = await testCommand(ListBackupCommand, [])
    expect(error?.message).toContain('Failed to list datasets')
    expect(error?.oclif?.exit).toBe(1)
  })
})

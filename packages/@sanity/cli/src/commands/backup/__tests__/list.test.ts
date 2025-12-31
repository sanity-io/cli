import {runCommand} from '@oclif/test'
import {select} from '@sanity/cli-core/ux'
import {mockApi, mockClient, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {BACKUP_API_VERSION} from '../../../actions/backup/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {ListBackupCommand} from '../list.js'

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
    const {error} = await testCommand(ListBackupCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {}},
      },
    })
    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when no datasets exist', async () => {
    mockListDatasets.mockResolvedValue([])

    const {error} = await testCommand(ListBackupCommand, [], {
      mocks: defaultMocks,
    })
    expect(error?.message).toBe('No datasets found in this project.')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should list backups for a specified dataset', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'get',
      query: {limit: '30'},
      uri: `/projects/${testProjectId}/datasets/production/backups`,
    }).reply(200, backupsResponse)

    const {stdout} = await testCommand(ListBackupCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('RESOURCE')
    expect(stdout).toContain('CREATED AT')
    expect(stdout).toContain('BACKUP ID')
    expect(stdout).toContain('Dataset')
    expect(stdout).toContain('backup-1')
    expect(stdout).toContain('backup-2')
  })

  test('should list backups with custom limit', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'get',
      query: {limit: '50'},
      uri: `/projects/${testProjectId}/datasets/production/backups`,
    }).reply(200, backupsResponse)

    const {stdout} = await testCommand(ListBackupCommand, ['production', '--limit', '50'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('backup-1')
    expect(stdout).toContain('backup-2')
  })

  test('should list backups with date filters', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'get',
      query: {after: '2024-01-01', before: '2024-01-31', limit: '30'},
      uri: `/projects/${testProjectId}/datasets/production/backups`,
    }).reply(200, backupsResponse)

    const {stdout} = await testCommand(
      ListBackupCommand,
      ['production', '--after', '2024-01-01', '--before', '2024-01-31'],
      {
        mocks: defaultMocks,
      },
    )

    expect(stdout).toContain('backup-1')
    expect(stdout).toContain('backup-2')
  })

  test('should show message when no backups found', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'get',
      query: {limit: '30'},
      uri: `/projects/${testProjectId}/datasets/production/backups`,
    }).reply(200, {backups: []})

    const {stdout} = await testCommand(ListBackupCommand, ['production'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('No backups found.')
  })

  test('should prompt for dataset selection when no dataset is specified', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])
    mockSelect.mockResolvedValueOnce('staging')

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'get',
      query: {limit: '30'},
      uri: `/projects/${testProjectId}/datasets/staging/backups`,
    }).reply(200, backupsResponse)

    const {stdout} = await testCommand(ListBackupCommand, [], {
      mocks: defaultMocks,
    })

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
    mockListDatasets.mockResolvedValue([{name: 'production'}])

    const {error} = await testCommand(
      ListBackupCommand,
      ['production', '--after', 'invalid-date'],
      {
        mocks: defaultMocks,
      },
    )
    expect(error?.message).toContain("Invalid date format for '--after' flag")
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when after date is after before date', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])

    const {error} = await testCommand(
      ListBackupCommand,
      ['production', '--after', '2024-01-31', '--before', '2024-01-01'],
      {
        mocks: defaultMocks,
      },
    )
    expect(error?.message).toBe('Parsing date flags: --after date must be before --before')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail with invalid limit', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])

    const {error} = await testCommand(ListBackupCommand, ['production', '--limit', '0'], {
      mocks: defaultMocks,
    })
    expect(error?.message).toContain('must be an integer between 1 and')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should fail when dataset does not exist', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}, {name: 'staging'}])

    const {error} = await testCommand(ListBackupCommand, ['nonexistent'], {
      mocks: defaultMocks,
    })
    expect(error?.message).toContain('Dataset')
    expect(error?.message).toContain('not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle API errors', async () => {
    mockListDatasets.mockResolvedValue([{name: 'production'}])

    mockApi({
      apiVersion: BACKUP_API_VERSION,
      method: 'get',
      query: {limit: '30'},
      uri: `/projects/${testProjectId}/datasets/production/backups`,
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(ListBackupCommand, ['production'], {
      mocks: defaultMocks,
    })
    expect(error?.message).toContain('List dataset backup failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('should handle failed dataset listing', async () => {
    mockListDatasets.mockRejectedValue(new Error('Server Error'))

    const {error} = await testCommand(ListBackupCommand, [], {
      mocks: defaultMocks,
    })
    expect(error?.message).toContain('Failed to list datasets')
    expect(error?.oclif?.exit).toBe(1)
  })
})

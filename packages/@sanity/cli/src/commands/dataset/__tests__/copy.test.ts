import {select} from '@inquirer/prompts'
import {testCommand} from '@sanity/cli-test'
import {of, throwError} from 'rxjs'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {getCliConfig} from '../../../../../cli-core/src/config/cli/getCliConfig.js'
import * as datasetsService from '../../../services/datasets.js'
import {CopyDatasetCommand} from '../copy.js'

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

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
}))

vi.mock('../../../services/datasets.js', () => ({
  copyDataset: vi.fn(),
  followCopyJobProgress: vi.fn(),
  listDatasetCopyJobs: vi.fn(),
  listDatasets: vi.fn(),
}))

const mockGetCliConfig = vi.mocked(getCliConfig)
const mockSelect = vi.mocked(select)
const mockCopyDataset = vi.mocked(datasetsService.copyDataset)
const mockFollowCopyJobProgress = vi.mocked(datasetsService.followCopyJobProgress)
const mockListDatasetCopyJobs = vi.mocked(datasetsService.listDatasetCopyJobs)
const mockListDatasets = vi.mocked(datasetsService.listDatasets)

// Helper to create mock datasets
function createMockDataset(name: string) {
  return {
    aclMode: 'public' as const,
    addonFor: null,
    createdAt: '2023-01-01T00:00:00Z',
    createdByUserId: 'test-user',
    datasetProfile: 'default',
    features: [],
    name,
    tags: [],
  }
}

describe('#dataset:copy', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('list mode', () => {
    test('lists copy jobs successfully', async () => {
      mockListDatasetCopyJobs.mockResolvedValue([
        {
          createdAt: '2023-01-01T00:00:00Z',
          id: 'job-1',
          sourceDataset: 'production',
          state: 'completed',
          targetDataset: 'backup',
          updatedAt: '2023-01-01T00:05:00Z',
          withHistory: true,
        },
        {
          createdAt: '2023-01-02T00:00:00Z',
          id: 'job-2',
          sourceDataset: 'staging',
          state: 'failed',
          targetDataset: 'test',
          updatedAt: '2023-01-02T00:02:00Z',
          withHistory: false,
        },
      ])

      const {stdout} = await testCommand(CopyDatasetCommand, ['--list'])

      expect(mockListDatasetCopyJobs).toHaveBeenCalledWith({
        limit: undefined,
        offset: undefined,
        projectId: 'test-project',
      })
      expect(stdout).toContain('Dataset copy jobs')
      expect(stdout).toContain('job-1')
      expect(stdout).toContain('job-2')
      expect(stdout).toContain('production')
      expect(stdout).toContain('staging')
    })

    test('lists copy jobs with offset and limit', async () => {
      mockListDatasetCopyJobs.mockResolvedValue([])

      await testCommand(CopyDatasetCommand, ['--list', '--offset', '2', '--limit', '10'])

      expect(mockListDatasetCopyJobs).toHaveBeenCalledWith({
        limit: 10,
        offset: 2,
        projectId: 'test-project',
      })
    })

    test('shows message when no copy jobs exist', async () => {
      mockListDatasetCopyJobs.mockResolvedValue([])

      const {stdout} = await testCommand(CopyDatasetCommand, ['--list'])

      expect(stdout).toContain("This project doesn't have any dataset copy jobs")
    })

    test('handles errors when listing copy jobs', async () => {
      mockListDatasetCopyJobs.mockRejectedValue(new Error('API Error'))

      const {error} = await testCommand(CopyDatasetCommand, ['--list'])

      expect(error?.message).toContain('Failed to list dataset copy jobs: API Error')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('attach mode', () => {
    test('attaches to running job and shows progress', async () => {
      mockFollowCopyJobProgress.mockReturnValue(
        of(
          {progress: 25, type: 'progress'},
          {progress: 50, type: 'progress'},
          {progress: 75, type: 'progress'},
          {progress: 100, type: 'progress'},
        ),
      )

      const {stdout} = await testCommand(CopyDatasetCommand, ['--attach', 'job-123'])

      expect(mockFollowCopyJobProgress).toHaveBeenCalledWith({
        jobId: 'job-123',
        projectId: 'test-project',
      })
      expect(stdout).toContain('Job job-123 completed')
    })

    test('handles progress tracking errors', async () => {
      mockFollowCopyJobProgress.mockReturnValue(throwError(() => new Error('Connection lost')))

      const {error} = await testCommand(CopyDatasetCommand, ['--attach', 'job-123'])

      expect(error?.message).toContain('Failed to attach to copy job: Connection lost')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('copy mode', () => {
    test('copies dataset with provided arguments', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockCopyDataset.mockResolvedValue({jobId: 'job-456'})
      mockFollowCopyJobProgress.mockReturnValue(of({progress: 100, type: 'progress'}))

      const {stdout} = await testCommand(CopyDatasetCommand, ['production', 'backup'])

      expect(mockCopyDataset).toHaveBeenCalledWith({
        projectId: 'test-project',
        skipHistory: false,
        sourceDataset: 'production',
        targetDataset: 'backup',
      })
      expect(stdout).toContain('Copying dataset production to backup')
      expect(stdout).toContain('Job job-456 started')
      expect(stdout).toContain('Job job-456 completed')
    })

    test('prompts for source dataset when not provided', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockSelect.mockResolvedValueOnce('production')
      mockSelect.mockResolvedValueOnce('backup')
      mockCopyDataset.mockResolvedValue({jobId: 'job-789'})
      mockFollowCopyJobProgress.mockReturnValue(of({progress: 100, type: 'progress'}))

      await testCommand(CopyDatasetCommand, [])

      expect(mockSelect).toHaveBeenCalledWith({
        choices: expect.arrayContaining([
          expect.objectContaining({value: 'production'}),
          expect.objectContaining({value: 'staging'}),
        ]),
        message: 'Select the dataset name:',
      })
    })

    test.each([
      {
        args: ['Invalid-Dataset', 'backup'],
        description: 'source dataset name is invalid',
        expectedError: 'must be all lowercase',
        setupMocks: () => {
          // No additional mocks needed - validation happens before dataset fetch
        },
      },
      {
        args: ['nonexistent', 'backup'],
        description: 'source dataset does not exist',
        expectedError: 'Source dataset "nonexistent" doesn\'t exist',
        setupMocks: () => {
          mockListDatasets.mockResolvedValue([
            createMockDataset('production'),
            createMockDataset('staging'),
          ])
        },
      },
      {
        args: ['production', 'Invalid-Dataset'],
        description: 'target dataset name is invalid',
        expectedError: 'must be all lowercase',
        setupMocks: () => {
          mockListDatasets.mockResolvedValue([
            createMockDataset('production'),
            createMockDataset('staging'),
          ])
        },
      },
      {
        args: ['production', 'staging'],
        description: 'target dataset already exists',
        expectedError: 'Target dataset "staging" already exists',
        setupMocks: () => {
          mockListDatasets.mockResolvedValue([
            createMockDataset('production'),
            createMockDataset('staging'),
          ])
        },
      },
    ])('errors when $description', async ({args, expectedError, setupMocks}) => {
      setupMocks()

      const {error} = await testCommand(CopyDatasetCommand, args)

      expect(error?.message).toContain(expectedError)
      expect(error?.oclif?.exit).toBe(1)
    })

    test('copies dataset with skip-history flag', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockCopyDataset.mockResolvedValue({jobId: 'job-skip'})
      mockFollowCopyJobProgress.mockReturnValue(of({progress: 100, type: 'progress'}))

      await testCommand(CopyDatasetCommand, ['production', 'backup', '--skip-history'])

      expect(mockCopyDataset).toHaveBeenCalledWith({
        projectId: 'test-project',
        skipHistory: true,
        sourceDataset: 'production',
        targetDataset: 'backup',
      })
    })

    test('copies dataset with detach flag (does not wait for completion)', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockCopyDataset.mockResolvedValue({jobId: 'job-detach'})

      const {stdout} = await testCommand(CopyDatasetCommand, ['production', 'backup', '--detach'])

      expect(mockCopyDataset).toHaveBeenCalledWith({
        projectId: 'test-project',
        skipHistory: false,
        sourceDataset: 'production',
        targetDataset: 'backup',
      })
      expect(stdout).toContain('Job job-detach started')
      expect(stdout).not.toContain('Job job-detach completed')
      expect(mockFollowCopyJobProgress).not.toHaveBeenCalled()
    })

    test('handles copy dataset errors', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockCopyDataset.mockRejectedValue(new Error('Insufficient permissions'))

      const {error} = await testCommand(CopyDatasetCommand, ['production', 'backup'])

      expect(error?.message).toContain('Dataset copying failed: Insufficient permissions')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles fetch datasets error', async () => {
      mockListDatasets.mockRejectedValue(new Error('Network error'))

      const {error} = await testCommand(CopyDatasetCommand, ['production', 'backup'])

      expect(error?.message).toContain('Failed to fetch datasets: Network error')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('flag validation', () => {
    test.each([
      {desc: '--list with --attach', flags: ['--list', '--attach', 'job-123']},
      {desc: '--list with --detach', flags: ['--list', '--detach']},
      {desc: '--attach with --detach', flags: ['--attach', 'job-123', '--detach']},
    ])('errors when using mutually exclusive flags: $desc', async ({flags}) => {
      const {error} = await testCommand(CopyDatasetCommand, flags)

      expect(error?.message).toContain('cannot also be provided when using')
      expect(error?.oclif?.exit).toBe(2)
    })

    test.each([
      {flag: '--offset', value: '2'},
      {flag: '--limit', value: '10'},
    ])('errors when $flag is used without --list', async ({flag, value}) => {
      const {error} = await testCommand(CopyDatasetCommand, [flag, value])

      expect(error?.message).toContain('--list')
      expect(error?.oclif?.exit).toBe(2)
    })
  })

  test('errors when no project ID is found', async () => {
    mockGetCliConfig.mockResolvedValueOnce({
      api: undefined,
    } as ReturnType<typeof getCliConfig> extends Promise<infer T> ? T : never)

    const {error} = await testCommand(CopyDatasetCommand, ['production', 'backup'])

    expect(error?.message).toContain('sanity.cli.ts does not contain a project identifier')
    expect(error?.oclif?.exit).toBe(1)
  })
})

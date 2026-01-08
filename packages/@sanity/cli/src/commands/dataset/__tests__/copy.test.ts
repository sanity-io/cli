import {runCommand} from '@oclif/test'
import {select} from '@sanity/cli-core/ux'
import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {of, throwError} from 'rxjs'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DATASET_API_VERSION, followCopyJobProgress} from '../../../services/datasets.js'
import {CopyDatasetCommand} from '../copy.js'

const mockListDatasets = vi.hoisted(() => vi.fn())
const testProjectId = vi.hoisted(() => 'test-project')
const testToken = vi.hoisted(() => 'test-token')

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  const testClient = createTestClient({
    apiVersion: 'v2025-09-16',
    projectId: testProjectId,
    token: testToken,
  })

  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        list: mockListDatasets,
      } as never,
      request: testClient.request,
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

vi.mock('../../../services/datasets.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/datasets.js')>()
  return {
    ...actual,
    // Keep only followCopyJobProgress mocked since it uses EventSource streaming
    followCopyJobProgress: vi.fn(),
  }
})

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: testToken,
}

const mockSelect = vi.mocked(select)
const mockFollowCopyJobProgress = vi.mocked(followCopyJobProgress)

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
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('help works', async () => {
    const {stdout} = await runCommand(['dataset copy', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Manages dataset copying, including starting a new copy job, listing copy jobs and following the progress of a running copy job

      USAGE
        $ sanity dataset copy [SOURCE] [TARGET] [--attach <value> | --list |
          --detach | --skip-history] [--limit <value> ] [--offset <value> ]

      ARGUMENTS
        [SOURCE]  Name of the dataset to copy from
        [TARGET]  Name of the dataset to copy to

      FLAGS
        --attach=<value>  Attach to the running copy process to show progress
        --detach          Start the copy without waiting for it to finish
        --limit=<value>   Maximum number of jobs returned (default 10, max 1000)
        --list            Lists all dataset copy jobs
        --offset=<value>  Start position in the list of jobs (default 0)
        --skip-history    Don't preserve document history on copy

      DESCRIPTION
        Manages dataset copying, including starting a new copy job, listing copy jobs
        and following the progress of a running copy job

      EXAMPLES
        Interactively copy a dataset

          $ sanity dataset copy

        Copy from source-dataset (prompts for target)

          $ sanity dataset copy source-dataset

        Copy from source-dataset to target-dataset

          $ sanity dataset copy source-dataset target-dataset

        Copy without preserving document history (faster for large datasets)

          $ sanity dataset copy --skip-history source target

        Start copy job without waiting for completion

          $ sanity dataset copy --detach source target

        Attach to a running copy job to follow progress

          $ sanity dataset copy --attach <job-id>

        List all dataset copy jobs

          $ sanity dataset copy --list

        List copy jobs with pagination

          $ sanity dataset copy --list --offset 2 --limit 10

      "
    `)
  })

  describe('list mode', () => {
    test('lists copy jobs successfully', async () => {
      mockApi({
        apiHost: `https://${testProjectId}.api.sanity.io`,
        apiVersion: DATASET_API_VERSION,
        method: 'get',
        uri: `/projects/${testProjectId}/datasets/copy`,
      }).reply(200, [
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

      const {stdout} = await testCommand(CopyDatasetCommand, ['--list'], {mocks: defaultMocks})

      expect(stdout).toContain('Dataset copy jobs')
      expect(stdout).toContain('job-1')
      expect(stdout).toContain('job-2')
      expect(stdout).toContain('production')
      expect(stdout).toContain('staging')
    })

    test('lists copy jobs with offset and limit', async () => {
      mockApi({
        apiHost: `https://${testProjectId}.api.sanity.io`,
        apiVersion: DATASET_API_VERSION,
        method: 'get',
        query: {
          limit: '10',
          offset: '2',
        },
        uri: `/projects/${testProjectId}/datasets/copy`,
      }).reply(200, [
        {
          createdAt: '2023-01-01T00:00:00Z',
          id: 'job-2',
          sourceDataset: 'production',
          state: 'completed',
          targetDataset: 'backup',
          updatedAt: '2023-01-01T00:05:00Z',
          withHistory: true,
        },
        {
          createdAt: '2023-01-02T00:00:00Z',
          id: 'job-3',
          sourceDataset: 'staging',
          state: 'failed',
          targetDataset: 'test',
          updatedAt: '2023-01-02T00:02:00Z',
          withHistory: false,
        },
      ])

      const {stdout} = await testCommand(
        CopyDatasetCommand,
        ['--list', '--offset', '2', '--limit', '10'],
        {
          mocks: defaultMocks,
        },
      )

      expect(stdout).toContain('job-2')
      expect(stdout).toContain('job-3')
      expect(stdout).toContain('production')
      expect(stdout).toContain('staging')
    })

    test('shows message when no copy jobs exist', async () => {
      mockApi({
        apiHost: `https://${testProjectId}.api.sanity.io`,
        apiVersion: DATASET_API_VERSION,
        method: 'get',
        uri: `/projects/${testProjectId}/datasets/copy`,
      }).reply(200, [])

      const {stdout} = await testCommand(CopyDatasetCommand, ['--list'], {mocks: defaultMocks})

      expect(stdout).toContain("This project doesn't have any dataset copy jobs")
    })

    test('handles errors when listing copy jobs', async () => {
      mockApi({
        apiHost: `https://${testProjectId}.api.sanity.io`,
        apiVersion: DATASET_API_VERSION,
        method: 'get',
        uri: `/projects/${testProjectId}/datasets/copy`,
      }).reply(500, {
        error: 'API Error',
        message: 'API Error',
      })

      const {error} = await testCommand(CopyDatasetCommand, ['--list'], {mocks: defaultMocks})

      expect(error?.message).toContain('Failed to list dataset copy jobs')
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

      const {stdout} = await testCommand(CopyDatasetCommand, ['--attach', 'job-123'], {
        mocks: defaultMocks,
      })

      expect(mockFollowCopyJobProgress).toHaveBeenCalledWith({
        jobId: 'job-123',
        projectId: 'test-project',
      })
      expect(stdout).toContain('Job job-123 completed')
    })

    test('handles progress tracking errors', async () => {
      mockFollowCopyJobProgress.mockReturnValue(throwError(() => new Error('Connection lost')))

      const {error} = await testCommand(CopyDatasetCommand, ['--attach', 'job-123'], {
        mocks: defaultMocks,
      })

      expect(error?.message).toContain('Failed to attach to copy job: Connection lost')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('rejects whitespace-only jobId', async () => {
      const {error} = await testCommand(CopyDatasetCommand, ['--attach', '   '], {
        mocks: defaultMocks,
      })

      expect(error?.message).toContain('Please supply a valid jobId')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles JSON parse errors from EventSource', async () => {
      mockFollowCopyJobProgress.mockReturnValue(
        throwError(() => new Error('Invalid JSON received from server: Unexpected token')),
      )

      const {error} = await testCommand(CopyDatasetCommand, ['--attach', 'job-123'], {
        mocks: defaultMocks,
      })

      expect(error?.message).toContain('Invalid JSON received from server')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles EventSource reconnection', async () => {
      mockFollowCopyJobProgress.mockReturnValue(
        of({progress: 25, type: 'progress'}, {type: 'reconnect'}, {progress: 50, type: 'progress'}),
      )

      const {stdout} = await testCommand(CopyDatasetCommand, ['--attach', 'job-123'], {
        mocks: defaultMocks,
      })

      expect(mockFollowCopyJobProgress).toHaveBeenCalledWith({
        jobId: 'job-123',
        projectId: 'test-project',
      })
      expect(stdout).toContain('Job job-123 completed')
    })

    test('handles channel_error from EventSource', async () => {
      mockFollowCopyJobProgress.mockReturnValue(
        throwError(() => new Error('Copy job failed: Channel closed unexpectedly')),
      )

      const {error} = await testCommand(CopyDatasetCommand, ['--attach', 'job-123'], {
        mocks: defaultMocks,
      })

      expect(error?.message).toContain('Copy job failed')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('copy mode', () => {
    test('copies dataset with provided arguments', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockApi({
        apiHost: `https://${testProjectId}.api.sanity.io`,
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        uri: `/datasets/production/copy`,
      }).reply(200, {jobId: 'job-456'})
      mockFollowCopyJobProgress.mockReturnValue(of({progress: 100, type: 'progress'}))

      const {stdout} = await testCommand(CopyDatasetCommand, ['production', 'backup'], {
        mocks: defaultMocks,
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
      mockApi({
        apiHost: `https://${testProjectId}.api.sanity.io`,
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        uri: `/datasets/production/copy`,
      }).reply(200, {jobId: 'job-789'})
      mockFollowCopyJobProgress.mockReturnValue(of({progress: 100, type: 'progress'}))

      await testCommand(CopyDatasetCommand, [], {mocks: defaultMocks})

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

      const {error} = await testCommand(CopyDatasetCommand, args, {mocks: defaultMocks})

      expect(error?.message).toContain(expectedError)
      expect(error?.oclif?.exit).toBe(1)
    })

    test('copies dataset with skip-history flag', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockApi({
        apiHost: `https://${testProjectId}.api.sanity.io`,
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        uri: `/datasets/production/copy`,
      }).reply(200, {jobId: 'job-skip'})
      mockFollowCopyJobProgress.mockReturnValue(of({progress: 100, type: 'progress'}))

      await testCommand(CopyDatasetCommand, ['production', 'backup', '--skip-history'], {
        mocks: defaultMocks,
      })
    })

    test('copies dataset with detach flag (does not wait for completion)', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockApi({
        apiHost: `https://${testProjectId}.api.sanity.io`,
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        uri: `/datasets/production/copy`,
      }).reply(200, {jobId: 'job-detach'})

      const {stdout} = await testCommand(CopyDatasetCommand, ['production', 'backup', '--detach'], {
        mocks: defaultMocks,
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
      mockApi({
        apiHost: `https://${testProjectId}.api.sanity.io`,
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        uri: `/datasets/production/copy`,
      }).reply(500, {
        error: 'Insufficient permissions',
        message: 'Insufficient permissions',
      })

      const {error} = await testCommand(CopyDatasetCommand, ['production', 'backup'], {
        mocks: defaultMocks,
      })

      expect(error?.message).toContain('Dataset copying failed')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles fetch datasets error', async () => {
      mockListDatasets.mockRejectedValue(new Error('Network error'))

      const {error} = await testCommand(CopyDatasetCommand, ['production', 'backup'], {
        mocks: defaultMocks,
      })

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
      const {error} = await testCommand(CopyDatasetCommand, flags, {mocks: defaultMocks})

      expect(error?.message).toContain('cannot also be provided when using')
      expect(error?.oclif?.exit).toBe(2)
    })

    test.each([
      {flag: '--offset', value: '2'},
      {flag: '--limit', value: '10'},
    ])('errors when $flag is used without --list', async ({flag, value}) => {
      const {error} = await testCommand(CopyDatasetCommand, [flag, value], {mocks: defaultMocks})

      expect(error?.message).toContain('--list')
      expect(error?.oclif?.exit).toBe(2)
    })
  })

  test('errors when no project ID is found', async () => {
    const {error} = await testCommand(CopyDatasetCommand, ['production', 'backup'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: undefined},
      },
    })

    expect(error?.message).toContain('sanity.cli.ts does not contain a project identifier')
    expect(error?.oclif?.exit).toBe(1)
  })
})

import {input, select} from '@sanity/cli-core/ux'
import {createTestClient, mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {of, throwError} from 'rxjs'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DATASET_API_VERSION, followCopyJobProgress} from '../../../services/datasets.js'
import {CopyDatasetCommand} from '../copy.js'

const mockListDatasets = vi.hoisted(() => vi.fn())
const mockGetProjectCliClient = vi.hoisted(() => vi.fn())
const testProjectId = vi.hoisted(() => 'test-project')
const testToken = vi.hoisted(() => 'test-token')

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()

  // Dynamically create a test client based on the projectId passed to getProjectCliClient,
  // so that HTTP requests target the correct host (e.g. other-project.api.sanity.io).
  mockGetProjectCliClient.mockImplementation((options?: {projectId?: string}) => {
    const client = createTestClient({
      apiVersion: 'v2025-09-16',
      projectId: options?.projectId ?? testProjectId,
      token: testToken,
    })
    return Promise.resolve({
      datasets: {
        list: mockListDatasets,
      } as never,
      request: client.request,
    })
  })

  return {
    ...actual,
    getProjectCliClient: mockGetProjectCliClient,
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

vi.mock('../../../prompts/promptForProject.js', async () => {
  const {NonInteractiveError} =
    await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    promptForProject: vi.fn().mockRejectedValue(new NonInteractiveError('select')),
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

  describe('list mode', () => {
    test('lists copy jobs successfully', async () => {
      mockApi({
        apiVersion: DATASET_API_VERSION,
        method: 'get',
        projectId: testProjectId,
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
        apiVersion: DATASET_API_VERSION,
        method: 'get',
        projectId: testProjectId,
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
        apiVersion: DATASET_API_VERSION,
        method: 'get',
        projectId: testProjectId,
        uri: `/projects/${testProjectId}/datasets/copy`,
      }).reply(200, [])

      const {stdout} = await testCommand(CopyDatasetCommand, ['--list'], {mocks: defaultMocks})

      expect(stdout).toContain("This project doesn't have any dataset copy jobs")
    })

    test('handles errors when listing copy jobs', async () => {
      mockApi({
        apiVersion: DATASET_API_VERSION,
        method: 'get',
        projectId: testProjectId,
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
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        projectId: testProjectId,
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
      const mockSelect = vi.mocked(select)
      const mockInput = vi.mocked(input)

      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockSelect.mockResolvedValueOnce('production')
      mockInput.mockResolvedValueOnce('backup')
      mockApi({
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        projectId: testProjectId,
        uri: `/datasets/production/copy`,
      }).reply(200, {jobId: 'job-789'})
      mockFollowCopyJobProgress.mockReturnValue(of({progress: 100, type: 'progress'}))

      const {error} = await testCommand(CopyDatasetCommand, [], {
        mocks: defaultMocks,
      })

      if (error) throw error
      expect(mockInput).toHaveBeenCalledOnce()

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
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        projectId: testProjectId,
        uri: `/datasets/production/copy`,
      }).reply(200, {jobId: 'job-skip'})
      mockFollowCopyJobProgress.mockReturnValue(of({progress: 100, type: 'progress'}))

      await testCommand(CopyDatasetCommand, ['production', 'backup', '--skip-history'], {
        mocks: defaultMocks,
      })
    })

    test('copies dataset with skip-content-releases flag', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockApi({
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        projectId: testProjectId,
        uri: `/datasets/production/copy`,
      }).reply(200, {jobId: 'job-no-releases'})
      mockFollowCopyJobProgress.mockReturnValue(of({progress: 100, type: 'progress'}))

      const {stdout} = await testCommand(
        CopyDatasetCommand,
        ['production', 'backup', '--skip-content-releases'],
        {mocks: defaultMocks},
      )

      expect(stdout).toContain('Job job-no-releases started')
      expect(stdout).toContain('Job job-no-releases completed')
    })

    test('copies dataset with detach flag (does not wait for completion)', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockApi({
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        projectId: testProjectId,
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
        apiVersion: DATASET_API_VERSION,
        method: 'put',
        projectId: testProjectId,
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

  test('uses --project-id flag when provided', async () => {
    mockListDatasets.mockResolvedValue([
      createMockDataset('production'),
      createMockDataset('staging'),
    ])
    mockApi({
      apiVersion: DATASET_API_VERSION,
      method: 'put',
      projectId: 'other-project',
      uri: `/datasets/production/copy`,
    }).reply(200, {jobId: 'job-other'})
    mockFollowCopyJobProgress.mockReturnValue(of({progress: 100, type: 'progress'}))

    const {error, stdout} = await testCommand(
      CopyDatasetCommand,
      ['--project-id', 'other-project', 'production', 'backup'],
      {mocks: defaultMocks},
    )

    expect(error).toBeUndefined()
    expect(stdout).toContain('Job job-other started')
    expect(mockGetProjectCliClient).toHaveBeenCalledWith(
      expect.objectContaining({projectId: 'other-project'}),
    )
  })

  test('errors when no project ID is found', async () => {
    const {error} = await testCommand(CopyDatasetCommand, ['production', 'backup'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: undefined},
      },
    })

    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })
})

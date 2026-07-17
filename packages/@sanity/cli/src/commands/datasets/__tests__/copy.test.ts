import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {spinnerText} from '@sanity/cli-test/mocks/cli-core/ux'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {CopyDatasetCommand} from '../copy.js'

vi.mock(
  '@sanity/cli-core/SanityCommand',
  async () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('@sanity/cli-core/ux', async () => import('@sanity/cli-test/mocks/cli-core/ux'))

const mockValidateDatasetName = vi.hoisted(() => vi.fn())
const mockPromptForDataset = vi.hoisted(() => vi.fn())
const mockPromptForDatasetName = vi.hoisted(() => vi.fn())
const mockCopyDataset = vi.hoisted(() => vi.fn())
const mockFollowCopyJob = vi.hoisted(() => vi.fn())
const mockListDatasetCopyJobs = vi.hoisted(() => vi.fn())
const mockListDatasets = vi.hoisted(() => vi.fn())
const mockHardExit = vi.hoisted(() => vi.fn())

vi.mock('../../../prompts/promptForDataset.js', () => ({
  promptForDataset: mockPromptForDataset,
}))

vi.mock('../../../prompts/promptForDatasetName.js', () => ({
  promptForDatasetName: mockPromptForDatasetName,
}))

vi.mock('../../../actions/dataset/validateDatasetName.js', () => ({
  validateDatasetName: mockValidateDatasetName,
}))

vi.mock('../../../prompts/promptForProject.js', () => ({
  promptForProject: vi.fn(),
}))

vi.mock('../../../services/datasets.js', () => ({
  copyDataset: mockCopyDataset,
  followCopyJobProgress: mockFollowCopyJob,
  listDatasetCopyJobs: mockListDatasetCopyJobs,
  listDatasets: mockListDatasets,
}))

vi.mock('@oclif/core/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@oclif/core/errors')>()
  return {
    ...actual,
    exit: mockHardExit,
  }
})

const TEST_PROJECT_ID = '1337newb'

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
  beforeEach(() => {
    mocks.SanityCmdGetProjectId.mockResolvedValue(TEST_PROJECT_ID)
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
    mockValidateDatasetName.mockReturnValue(undefined)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('flag validation', () => {
    test('requires source and target datasets in unattended mode', async () => {
      mocks.SanityCmdIsUnattended.mockReturnValue(true)
      vi.mocked(mocks.SanityCmdOutput.error).mockImplementation((message) => {
        throw new Error(String(message))
      })

      await expect(CopyDatasetCommand.run([])).rejects.toThrow(
        'Source dataset is required. Pass it as the `<source>` argument.\n' +
          'Error: Target dataset is required. Pass it as the `<target>` argument.',
      )
      expect(mocks.SanityCmdGetProjectId).not.toHaveBeenCalled()
      expect(mockListDatasets).not.toHaveBeenCalled()
      expect(mockPromptForDataset).not.toHaveBeenCalled()

      await expect(CopyDatasetCommand.run(['production'])).rejects.toThrow(
        'Target dataset is required',
      )
      expect(mocks.SanityCmdGetProjectId).not.toHaveBeenCalled()
      expect(mockListDatasets).not.toHaveBeenCalled()
      expect(mockPromptForDatasetName).not.toHaveBeenCalled()
      vi.mocked(mocks.SanityCmdOutput.error).mockImplementation(() => undefined as never)
    })

    test.each([
      {desc: '--list with --attach', flags: ['--list', '--attach', 'job-123']},
      {desc: '--list with --detach', flags: ['--list', '--detach']},
      {desc: '--attach with --detach', flags: ['--attach', 'job-123', '--detach']},
    ])('errors when using mutually exclusive flags: $desc', async ({flags}) => {
      await expect(CopyDatasetCommand.run(flags)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('cannot also be provided when using'),
        }),
      )
    })

    test.each([
      {flag: '--offset', value: '2'},
      {flag: '--limit', value: '10'},
    ])('errors when $flag is used without --list', async ({flag, value}) => {
      await expect(CopyDatasetCommand.run([flag, value])).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringMatching(/all of the following must be provided.*--list/i),
        }),
      )
    })
  })

  describe('list mode', () => {
    beforeEach(() => {
      mockListDatasetCopyJobs.mockResolvedValue([])
    })

    test('shows list dataset copy job API response, passing pagination parameters', async () => {
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

      await CopyDatasetCommand.run(['--list', '--offset', '2', '--limit', '10'])

      expect(mockListDatasetCopyJobs).toHaveBeenCalledWith({
        limit: 10,
        offset: 2,
        projectId: TEST_PROJECT_ID,
      })
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringMatching(/job-1.*production/i),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringMatching(/job-2.*staging/i),
      )
    })

    test('shows message when no copy jobs exist', async () => {
      mockListDatasetCopyJobs.mockResolvedValue([])
      await CopyDatasetCommand.run(['--list'])
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringMatching(/doesn't have any dataset copy jobs/i),
      )
    })

    test('errors and exits if list copy job API throws', async () => {
      mockListDatasetCopyJobs.mockRejectedValue('boom')
      await CopyDatasetCommand.run(['--list'])
      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringMatching(/failed to list dataset copy jobs.*boom/i),
        {exit: 1},
      )
    })
  })

  describe('attach mode', () => {
    test('rejects whitespace-only jobId', async () => {
      await CopyDatasetCommand.run(['--attach', '    '])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringMatching(/supply a valid jobId/i),
        {exit: 1},
      )
    })
    test('attaches to running job and shows progress', async () => {
      mockFollowCopyJob.mockReturnValue(
        of(
          {progress: 25, type: 'progress'},
          {progress: 50, type: 'progress'},
          {progress: 75, type: 'progress'},
          {progress: 100, type: 'progress'},
        ),
      )

      await CopyDatasetCommand.run(['--attach', 'job-123'])

      expect(mockFollowCopyJob).toHaveBeenCalledWith({
        jobId: 'job-123',
        projectId: TEST_PROJECT_ID,
      })
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringMatching(/job-123 completed/i),
      )
    })
    test('errors out if progress tracking throws', async () => {
      mockFollowCopyJob.mockThrow(new Error('boom'))

      await CopyDatasetCommand.run(['--attach', 'job-123'])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringMatching(/failed to attach to copy.*boom/i),
        {exit: 1},
      )
    })

    test('ignores reconnect CopyJobProgressEvents for purposes of progress reporting', async () => {
      mockFollowCopyJob.mockReturnValue(
        of(
          {progress: 25, type: 'progress'},
          {type: 'reconnect'},
          {progress: 50, type: 'progress'},
          {progress: 100, type: 'progress'},
        ),
      )

      await CopyDatasetCommand.run(['--attach', 'job-123'])

      expect(mockFollowCopyJob).toHaveBeenCalledWith({
        jobId: 'job-123',
        projectId: TEST_PROJECT_ID,
      })
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringMatching(/job-123 completed/i),
      )
      // Should set text on spinner only for events that contained progress number values, ignoring reconnect events
      expect(spinnerText).toHaveBeenCalledTimes(3)
    })
  })

  describe('copy mode', () => {
    test('copies provided source to target dataset, honouring defaults for skip-content-releases and skip-history flags', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockCopyDataset.mockResolvedValue({jobId: 'job-456'})
      mockFollowCopyJob.mockReturnValue(of({progress: 100, type: 'progress'}))

      await CopyDatasetCommand.run(['production', 'backup'])

      expect(mockCopyDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: TEST_PROJECT_ID,
          skipContentReleases: false,
          skipHistory: false,
          sourceDataset: 'production',
          targetDataset: 'backup',
        }),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringMatching(/Copying dataset production to backup/i),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringMatching(/job job-456 started/i),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringMatching(/job job-456 completed/i),
      )
    })

    test('prompts for source and target datasets when not provided', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockCopyDataset.mockResolvedValue({jobId: 'italian'})
      mockFollowCopyJob.mockReturnValue(of({progress: 100, type: 'progress'}))
      mockPromptForDataset.mockResolvedValue('production')
      mockPromptForDatasetName.mockResolvedValue('backup')

      await CopyDatasetCommand.run([])

      expect(mockPromptForDataset).toHaveBeenCalledOnce()
      expect(mockPromptForDatasetName).toHaveBeenCalledWith({
        message: 'Target dataset name:',
      })
    })

    test.each([
      {
        args: ['Invalid-Dataset', 'backup'],
        description: 'source dataset name is invalid',
        expectedError: 'must be all lowercase',
        expectedExit: exitCodes.USAGE_ERROR,
        setupMocks: () => {
          mockValidateDatasetName.mockReturnValue('must be all lowercase')
        },
      },
      {
        args: ['nonexistent', 'backup'],
        description: 'source dataset does not exist',
        expectedError: 'Source dataset "nonexistent" doesn\'t exist',
        expectedExit: exitCodes.RUNTIME_ERROR,
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
        expectedExit: exitCodes.USAGE_ERROR,
        setupMocks: () => {
          mockValidateDatasetName.mockImplementationOnce(() => undefined)
          mockValidateDatasetName.mockImplementationOnce(() => 'must be all lowercase')
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
        expectedExit: exitCodes.RUNTIME_ERROR,
        setupMocks: () => {
          mockListDatasets.mockResolvedValue([
            createMockDataset('production'),
            createMockDataset('staging'),
          ])
        },
      },
    ])('errors when $description', async ({args, expectedError, expectedExit, setupMocks}) => {
      setupMocks()

      await CopyDatasetCommand.run(args)

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(expectedError)),
        {exit: expectedExit},
      )
    })

    test('passes skip-history and skip-content-releases flags to copy dataset method if provided', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockCopyDataset.mockResolvedValue({jobId: 'job-skip'})
      mockFollowCopyJob.mockReturnValue(of({progress: 100, type: 'progress'}))

      await CopyDatasetCommand.run([
        'production',
        'backup',
        '--skip-history',
        '--skip-content-releases',
      ])

      expect(mockCopyDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: TEST_PROJECT_ID,
          skipContentReleases: true,
          skipHistory: true,
          sourceDataset: 'production',
          targetDataset: 'backup',
        }),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringMatching(/job job-skip completed/i),
      )
    })

    test('copies dataset with detach flag (does not wait for completion)', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockCopyDataset.mockResolvedValue({jobId: 'job-detach'})

      await CopyDatasetCommand.run(['production', 'backup', '--detach'])

      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringMatching(/job job-detach started/i),
      )
      expect(mocks.SanityCmdOutput.log).not.toHaveBeenCalledWith(
        expect.stringMatching(/job job-detach completed/i),
      )
      expect(mockFollowCopyJob).not.toHaveBeenCalled()
    })

    test('handles copy dataset errors', async () => {
      mockListDatasets.mockResolvedValue([
        createMockDataset('production'),
        createMockDataset('staging'),
      ])
      mockCopyDataset.mockRejectedValue(new Error('boom'))

      await CopyDatasetCommand.run(['production', 'backup'])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringMatching(/dataset copying failed: boom/i),
        {exit: 1},
      )
    })

    test('handles list datasets error', async () => {
      mockListDatasets.mockRejectedValue(new Error('boom'))

      await CopyDatasetCommand.run(['production', 'backup'])

      expect(mocks.SanityCmdOutput.error).toHaveBeenCalledWith(
        expect.stringMatching(/failed to fetch datasets: boom/i),
        {exit: 1},
      )
    })
  })
})

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createMockSanityCommand} from '../../../../test/mockSanityCommand.js'

// First: create the mocks and mocked SanityCommand class
const {MockedSanityCommand, mocks} = createMockSanityCommand()
// Second: install the mock on cli-core
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    SanityCommand: MockedSanityCommand,
  }
})

// Third: mock dataset copy command imports
const mockPromptForDataset = vi.hoisted(() => vi.fn())
const mockPromptForDatasetName = vi.hoisted(() => vi.fn())
const mockValidateDatasetName = vi.hoisted(() => vi.fn())
const mockListDatasets = vi.hoisted(() => vi.fn())
const mockListDatasetCopyJobs = vi.hoisted(() => vi.fn())
const mockCopyDataset = vi.hoisted(() => vi.fn())
const mockFollowCopyJob = vi.hoisted(() => vi.fn())
const mockHardExit = vi.hoisted(() => vi.fn())

vi.mock('../../../prompts/promptForDataset.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../prompts/promptForDataset.js')>()
  return {
    ...actual,
    promptForDataset: mockPromptForDataset,
  }
})

vi.mock('../../../prompts/promptForDatasetName.js', () => ({
  promptForDatasetName: mockPromptForDatasetName,
}))

vi.mock('../../../actions/dataset/validateDatasetName.js', () => ({
  validateDatasetName: mockValidateDatasetName,
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

// Finally, import the module under test: dataset copy command
const {CopyDatasetCommand} = await import('../copy.js')

const TEST_PROJECT_ID = '1337newb'

describe('#dataset:copy', () => {
  beforeEach(() => {
    mocks.SanityCmdGetProjectId.mockResolvedValue(TEST_PROJECT_ID)
    mocks.SanityCmdIsUnattended.mockReturnValue(false)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('flag validation', () => {
    test.each([
      {desc: '--list with --attach', flags: ['--list', '--attach', 'job-123']},
      {desc: '--list with --detach', flags: ['--list', '--detach']},
      {desc: '--attach with --detach', flags: ['--attach', 'job-123', '--detach']},
    ])('errors when using mutually exclusive flags: $desc', async ({flags}) => {
      expect(CopyDatasetCommand.run(flags)).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('cannot also be provided when using'),
        }),
      )
    })

    test.each([
      {flag: '--offset', value: '2'},
      {flag: '--limit', value: '10'},
    ])('errors when $flag is used without --list', async ({flag, value}) => {
      expect(CopyDatasetCommand.run([flag, value])).rejects.toThrow(
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
      expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(
        expect.stringMatching(/job-1.*production/i),
      )
      expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(
        expect.stringMatching(/job-2.*staging/i),
      )
    })

    test('shows message when no copy jobs exist', async () => {
      mockListDatasetCopyJobs.mockResolvedValue([])
      await CopyDatasetCommand.run(['--list'])
      expect(mocks.SanityCmdOutputLog).toHaveBeenCalledWith(
        expect.stringMatching(/doesn't have any dataset copy jobs/i),
      )
    })

    test('errors and exits if list copy job API throws', async () => {
      mockListDatasetCopyJobs.mockRejectedValue('boom')
      await CopyDatasetCommand.run(['--list'])
      expect(mocks.SanityCmdOutputError).toHaveBeenCalledWith(
        expect.stringMatching(/failed to list dataset copy jobs.*boom/i),
        {exit: 1},
      )
    })
  })
})

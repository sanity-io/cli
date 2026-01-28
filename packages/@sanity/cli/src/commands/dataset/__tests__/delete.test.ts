import {runCommand} from '@oclif/test'
import {input} from '@sanity/cli-core/ux'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {DeleteDatasetCommand} from '../delete.js'

const mockDeleteDataset = vi.hoisted(() => vi.fn())
const mockGetProjectById = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        delete: mockDeleteDataset,
      } as never,
      projects: {
        getById: mockGetProjectById,
      } as never,
    }),
  }
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: vi.fn(),
  }
})

const TEST_DATASET_NAME = 'test-dataset'
const TEST_PROJECT_NAME = 'Test Project'
const TEST_PROJECT_ID = 'test-project'

const defaultMocks = {
  cliConfig: {api: {projectId: TEST_PROJECT_ID}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const mockInput = vi.mocked(input)

describe('#dataset:delete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['dataset', 'delete', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "Delete a dataset within your project

      USAGE
        $ sanity dataset delete DATASETNAME [--force]

      ARGUMENTS
        DATASETNAME  Dataset name to delete

      FLAGS
        --force  Do not prompt for delete confirmation - forcefully delete

      DESCRIPTION
        Delete a dataset within your project

      EXAMPLES
        Delete a specific dataset

          $ sanity dataset delete my-dataset

        Delete a specific dataset without confirmation

          $ sanity dataset delete my-dataset --force

      "
    `)
  })

  test('deletes dataset with --force flag', async () => {
    mockDeleteDataset.mockResolvedValue(undefined)

    const {stderr, stdout} = await testCommand(
      DeleteDatasetCommand,
      [TEST_DATASET_NAME, '--force'],
      {
        mocks: defaultMocks,
      },
    )
    expect(stderr).toContain(`--force' used: skipping confirmation, deleting dataset`)
    expect(stdout).toBe('Dataset deleted successfully\n')
  })

  test('deletes dataset with confirmation prompt and validates input', async () => {
    mockInput.mockResolvedValue(TEST_DATASET_NAME)
    mockGetProjectById.mockResolvedValue({
      displayName: TEST_PROJECT_NAME,
      id: TEST_PROJECT_ID,
    } as never)
    mockDeleteDataset.mockResolvedValue(undefined)

    const {stdout} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain(
      `Deleting dataset "${TEST_DATASET_NAME}" from project "${TEST_PROJECT_NAME} (${TEST_PROJECT_ID})"`,
    )
    expect(stdout).toContain('Dataset deleted successfully\n')
    expect(mockInput).toHaveBeenCalledWith({
      message:
        'Are you ABSOLUTELY sure you want to delete this dataset?\n  Type the name of the dataset to confirm delete:',
      validate: expect.any(Function),
    })
  })

  test('throws error for empty dataset name', async () => {
    const {error: commandError} = await testCommand(DeleteDatasetCommand, ['', '--force'], {
      mocks: defaultMocks,
    })
    expect(commandError?.message).toBe('Dataset name is missing')
    expect(commandError?.oclif?.exit).toBe(1)
  })

  test.each([
    {desc: 'no project ID is found', projectId: undefined},
    {desc: 'project ID is empty string', projectId: ''},
  ])('throws error when $desc', async ({projectId}) => {
    const {error} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME, '--force'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId}},
      },
    })
    expect(error?.message).toBe(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    {desc: 'when deleting dataset', message: 'Internal Server Error', statusCode: 500},
    {desc: 'with 404 error when deleting dataset', message: 'Dataset not found', statusCode: 404},
    {desc: 'with 403 error when deleting dataset', message: 'Forbidden', statusCode: 403},
  ])('handles API error $desc', async ({message, statusCode}) => {
    const deleteError = new Error(message)
    Object.assign(deleteError, {statusCode})
    mockDeleteDataset.mockRejectedValue(deleteError)

    const {error} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME, '--force'], {
      mocks: defaultMocks,
    })
    expect(error?.message).toContain('Dataset deletion failed')
    expect(error?.message).toContain(message)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles network errors when deleting dataset', async () => {
    mockDeleteDataset.mockRejectedValue(new Error('Network error'))

    const {error} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME, '--force'], {
      mocks: defaultMocks,
    })
    expect(error?.message).toContain('Dataset deletion failed')
    expect(error?.message).toContain('Network error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API client creation errors', async () => {
    mockDeleteDataset.mockRejectedValue(new Error('Failed to create client'))

    const {error} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME, '--force'], {
      mocks: defaultMocks,
    })
    expect(error?.message).toContain('Dataset deletion failed')
    expect(error?.message).toContain('Failed to create client')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles user cancellation during confirmation', async () => {
    mockGetProjectById.mockResolvedValue({
      displayName: TEST_PROJECT_NAME,
      id: TEST_PROJECT_ID,
    } as never)
    mockInput.mockRejectedValue(new Error('User cancelled'))

    const {error} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME], {
      mocks: defaultMocks,
    })

    expect(error?.message).toBe('User cancelled')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles project retrieval error', async () => {
    mockGetProjectById.mockRejectedValue(new Error('Project Error'))

    const {error} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Project retrieval failed: Project Error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

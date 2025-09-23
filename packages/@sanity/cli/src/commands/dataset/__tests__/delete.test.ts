import {input} from '@inquirer/prompts'
import {runCommand} from '@oclif/test'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {DeleteDatasetCommand} from '../delete.js'

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

vi.mock('../../../../../cli-core/src/services/apiClient.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../../cli-core/src/services/apiClient.js')>()
  return {
    ...actual,
    getProjectCliClient: vi.fn(),
  }
})

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
}))

const TEST_DATASET_NAME = 'test-dataset'
const TEST_PROJECT_NAME = 'Test Project'
const TEST_PROJECT_ID = 'test-project'

const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

const setupMockClient = () => {
  mockGetProjectCliClient.mockResolvedValue({
    datasets: {
      delete: vi.fn().mockResolvedValue(undefined),
    },
    projects: {
      getById: vi.fn().mockResolvedValue({
        displayName: TEST_PROJECT_NAME,
        id: TEST_PROJECT_ID,
      }),
    },
  } as never)
}

describe('#dataset:delete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['dataset delete', '--help'])
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
    setupMockClient()

    const {stderr, stdout} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME, '--force'])
    expect(stderr).toContain(`--force' used: skipping confirmation, deleting dataset`)
    expect(stdout).toBe('Dataset deleted successfully\n')
  })

  test('deletes dataset with confirmation prompt and validates input', async () => {
    vi.mocked(input).mockResolvedValue(TEST_DATASET_NAME)
    setupMockClient()

    const {stdout} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME])

    expect(stdout).toContain(
      `Deleting dataset "${TEST_DATASET_NAME}" from project "${TEST_PROJECT_NAME} (${TEST_PROJECT_ID})"`,
    )
    expect(stdout).toContain('Dataset deleted successfully\n')
    expect(input).toHaveBeenCalledWith({
      message:
        'Are you ABSOLUTELY sure you want to delete this dataset?\n  Type the name of the dataset to confirm delete:',
      validate: expect.any(Function),
    })
  })

  test('throws error for empty dataset name', async () => {
    const {error: commandError} = await testCommand(DeleteDatasetCommand, ['', '--force'])
    expect(commandError?.message).toBe('Dataset name is missing')
    expect(commandError?.oclif?.exit).toBe(1)
  })

  test.each([
    {desc: 'no project ID is found', projectId: undefined},
    {desc: 'project ID is empty string', projectId: ''},
  ])('throws error when $desc', async ({projectId}) => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {projectId},
    })

    const {error} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME, '--force'])
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

    mockGetProjectCliClient.mockResolvedValueOnce({
      datasets: {
        delete: vi.fn().mockRejectedValue(deleteError),
      },
    } as never)

    const {error} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME, '--force'])
    expect(error?.message).toContain('Dataset deletion failed')
    expect(error?.message).toContain(message)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles network errors when deleting dataset', async () => {
    mockGetProjectCliClient.mockResolvedValueOnce({
      datasets: {
        delete: vi.fn().mockRejectedValue(new Error('Network error')),
      },
    } as never)

    const {error} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME, '--force'])
    expect(error?.message).toContain('Dataset deletion failed')
    expect(error?.message).toContain('Network error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API client creation errors', async () => {
    mockGetProjectCliClient.mockRejectedValueOnce(new Error('Failed to create client'))

    const {error} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME, '--force'])
    expect(error?.message).toContain('Dataset deletion failed')
    expect(error?.message).toContain('Failed to create client')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles user cancellation during confirmation', async () => {
    vi.mocked(input).mockRejectedValue(new Error('User cancelled'))

    const {error} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME])

    expect(error?.message).toBe('User cancelled')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles project retrieval error', async () => {
    mockGetProjectCliClient.mockResolvedValueOnce({
      projects: {
        getById: vi.fn().mockRejectedValueOnce(new Error('Project Error')),
      },
    } as never)

    const {error} = await testCommand(DeleteDatasetCommand, [TEST_DATASET_NAME])

    expect(error?.message).toContain('Project retrieval failed: Project Error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

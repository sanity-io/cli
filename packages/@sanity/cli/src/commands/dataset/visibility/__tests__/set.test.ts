import {runCommand} from '@oclif/test'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../../util/errorMessages.js'
import {DatasetVisibilitySetCommand} from '../set.js'

vi.mock('../../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn(),
}))

vi.mock('../../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('../../../../../../cli-core/src/services/apiClient.js', () => ({
  getProjectCliClient: vi.fn(),
}))

const mockGetCliConfig = vi.mocked(getCliConfig)
const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

describe('#dataset:visibility:set', () => {
  const mockEdit = vi.fn()

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['dataset visibility set', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Set the visibility of a dataset

      USAGE
        $ sanity dataset visibility set DATASET MODE

      ARGUMENTS
        DATASET  The name of the dataset to set visibility for
        MODE     (public|private) The visibility mode to set

      DESCRIPTION
        Set the visibility of a dataset

      EXAMPLES
        Make a dataset private

          $ sanity dataset visibility set my-dataset private

        Make a dataset public

          $ sanity dataset visibility set my-dataset public

      "
    `)
  })

  test('sets dataset visibility to public successfully', async () => {
    const mockDatasets = [{aclMode: 'private', name: 'my-dataset'}]

    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    })

    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        edit: mockEdit.mockResolvedValue({}),
        list: vi.fn().mockResolvedValue(mockDatasets),
      },
    } as never)

    const {stdout} = await testCommand(DatasetVisibilitySetCommand, ['my-dataset', 'public'])

    expect(stdout).toContain('Dataset visibility changed')
    expect(mockEdit).toHaveBeenCalledWith('my-dataset', {aclMode: 'public'})
  })

  test('sets dataset visibility to private successfully with warning', async () => {
    const mockDatasets = [{aclMode: 'public', name: 'my-dataset'}]

    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    })

    // Mock the client used by listDatasets action
    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        edit: mockEdit.mockResolvedValue({}),
        list: vi.fn().mockResolvedValue(mockDatasets),
      },
    } as never)

    const {stdout} = await testCommand(DatasetVisibilitySetCommand, ['my-dataset', 'private'])

    expect(stdout).toContain(
      'Please note that while documents are private, assets (files and images) are still public',
    )
    expect(stdout).toContain('Dataset visibility changed')
    expect(mockEdit).toHaveBeenCalledWith('my-dataset', {aclMode: 'private'})
  })

  test('shows message when dataset is already in the specified mode', async () => {
    const mockDatasets = [{aclMode: 'private', name: 'my-dataset'}]

    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    })

    // Mock the client used by listDatasets action
    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        edit: mockEdit,
        list: vi.fn().mockResolvedValue(mockDatasets),
      },
    } as never)

    const {stdout} = await testCommand(DatasetVisibilitySetCommand, ['my-dataset', 'private'])

    expect(stdout).toContain('Dataset already in "private" mode')
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('shows error when dataset is not found', async () => {
    const mockDatasets = [{aclMode: 'public', name: 'other-dataset'}]

    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    })

    // Mock the client used by listDatasets action
    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        edit: mockEdit,
        list: vi.fn().mockResolvedValue(mockDatasets),
      },
    } as never)

    const {error} = await testCommand(DatasetVisibilitySetCommand, ['not-found', 'private'])

    expect(error?.message).toContain('Dataset "not-found" not found')
    expect(mockEdit).not.toHaveBeenCalled()
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error for invalid dataset name', async () => {
    const invalidDatasetName = 'invalid-dataset-name!'

    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    })

    const {error} = await testCommand(DatasetVisibilitySetCommand, [invalidDatasetName, 'private'])

    expect(error?.message).toContain('Dataset name must only contain')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles error when listing datasets fails', async () => {
    const listError = new Error('Failed to fetch datasets')

    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    })

    // Mock the client used by listDatasets action to throw an error
    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        edit: mockEdit,
        list: vi.fn().mockRejectedValue(listError),
      },
    } as never)

    const {error} = await testCommand(DatasetVisibilitySetCommand, ['my-dataset', 'private'])

    expect(error?.message).toContain('Failed to list datasets: Failed to fetch datasets')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles error when editing dataset fails', async () => {
    const mockDatasets = [{aclMode: 'public', name: 'my-dataset'}]
    const editError = new Error('Failed to update dataset')

    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    })

    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        edit: mockEdit.mockRejectedValue(editError),
        list: vi.fn().mockResolvedValue(mockDatasets),
      },
    } as never)

    const {error} = await testCommand(DatasetVisibilitySetCommand, ['my-dataset', 'private'])

    expect(error?.message).toContain('Failed to edit dataset: Failed to update dataset')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when no project ID is available', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: undefined,
      },
    })

    const {error} = await testCommand(DatasetVisibilitySetCommand, ['my-dataset', 'private'])

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })
})

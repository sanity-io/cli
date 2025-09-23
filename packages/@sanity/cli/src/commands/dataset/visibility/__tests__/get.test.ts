import {runCommand} from '@oclif/test'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../../util/errorMessages.js'
import {DatasetVisibilityGetCommand} from '../get.js'

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

vi.mock(import('../../../../../../cli-core/src/services/apiClient.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getProjectCliClient: vi.fn(),
  }
})

const mockGetCliConfig = vi.mocked(getCliConfig)
const mockGetProjectCliClient = vi.mocked(getProjectCliClient)

describe('#dataset:visibility:get', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['dataset visibility get', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Get the visibility of a dataset

      USAGE
        $ sanity dataset visibility get DATASET

      ARGUMENTS
        DATASET  The name of the dataset to get visibility for

      DESCRIPTION
        Get the visibility of a dataset

      EXAMPLES
        Check the visibility of a dataset

          $ sanity dataset visibility get my-dataset

      "
    `)
  })

  test('gets dataset visibility successfully', async () => {
    const mockDatasets = [{aclMode: 'private', name: 'my-dataset'}]

    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    })

    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        list: vi.fn().mockResolvedValue(mockDatasets),
      },
    } as never)

    const {stdout} = await testCommand(DatasetVisibilityGetCommand, ['my-dataset'])

    expect(stdout).toContain('private')
  })

  test('shows error when dataset is not found', async () => {
    const mockDatasets = [{aclMode: 'public', name: 'other-dataset'}]

    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    })

    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        list: vi.fn().mockResolvedValue(mockDatasets),
      },
    } as never)

    const {error} = await testCommand(DatasetVisibilityGetCommand, ['not-found'])

    expect(error?.message).toContain('Dataset not found: not-found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error for invalid dataset name', async () => {
    const invalidDatasetName = 'invalid-dataset-name!'

    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    })

    const {error} = await testCommand(DatasetVisibilityGetCommand, [invalidDatasetName])

    expect(error?.message).toContain('Dataset name must only contain')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when no project ID is available', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: undefined,
      },
    })

    const {error} = await testCommand(DatasetVisibilityGetCommand, ['my-dataset'])

    expect(error?.message).toContain(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles error when listing datasets', async () => {
    mockGetCliConfig.mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    })

    mockGetProjectCliClient.mockResolvedValue({
      datasets: {
        list: vi.fn().mockRejectedValue(new Error('Network error')),
      },
    } as never)

    const {error} = await testCommand(DatasetVisibilityGetCommand, ['my-dataset'])

    expect(error?.message).toContain('Failed to list datasets')
    expect(error?.oclif?.exit).toBe(1)
  })
})

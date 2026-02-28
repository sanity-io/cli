import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DatasetVisibilityGetCommand} from '../get.js'

const mockListDatasets = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        list: mockListDatasets,
      } as never,
    }),
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

describe('#dataset:visibility:get', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('gets dataset visibility successfully', async () => {
    mockListDatasets.mockResolvedValue([{aclMode: 'private', name: 'my-dataset'}] as never)

    const {stdout} = await testCommand(DatasetVisibilityGetCommand, ['my-dataset'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('private')
  })

  test('shows error when dataset is not found', async () => {
    mockListDatasets.mockResolvedValue([{aclMode: 'public', name: 'other-dataset'}] as never)

    const {error} = await testCommand(DatasetVisibilityGetCommand, ['not-found'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Dataset not found: not-found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error for invalid dataset name', async () => {
    const invalidDatasetName = 'invalid-dataset-name!'

    const {error} = await testCommand(DatasetVisibilityGetCommand, [invalidDatasetName], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Dataset name must only contain')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when no project ID is available', async () => {
    const {error} = await testCommand(DatasetVisibilityGetCommand, ['my-dataset'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles error when listing datasets', async () => {
    mockListDatasets.mockRejectedValue(new Error('Network error'))

    const {error} = await testCommand(DatasetVisibilityGetCommand, ['my-dataset'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Failed to list datasets')
    expect(error?.oclif?.exit).toBe(1)
  })
})

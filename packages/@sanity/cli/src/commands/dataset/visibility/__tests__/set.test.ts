import {NonInteractiveError} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {DatasetVisibilitySetCommand} from '../set.js'

vi.mock('../../../../prompts/promptForProject.js', () => ({
  promptForProject: vi.fn().mockRejectedValue(new NonInteractiveError('select')),
}))

const mockListDatasets = vi.hoisted(() => vi.fn())
const mockEditDatasetAcl = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getProjectCliClient: vi.fn().mockResolvedValue({
      datasets: {
        edit: mockEditDatasetAcl,
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

describe('#dataset:visibility:set', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('sets dataset visibility to public successfully', async () => {
    mockListDatasets.mockResolvedValue([{aclMode: 'private', name: 'my-dataset'}] as never)
    mockEditDatasetAcl.mockResolvedValue(undefined as never)

    const {stdout} = await testCommand(DatasetVisibilitySetCommand, ['my-dataset', 'public'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Dataset visibility changed')
    expect(mockEditDatasetAcl).toHaveBeenCalledWith('my-dataset', {
      aclMode: 'public',
    })
  })

  test('sets dataset visibility to private successfully with warning', async () => {
    mockListDatasets.mockResolvedValue([{aclMode: 'public', name: 'my-dataset'}] as never)
    mockEditDatasetAcl.mockResolvedValue(undefined as never)

    const {stdout} = await testCommand(DatasetVisibilitySetCommand, ['my-dataset', 'private'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain(
      'Please note that while documents are private, assets (files and images) are still public',
    )
    expect(stdout).toContain('Dataset visibility changed')
    expect(mockEditDatasetAcl).toHaveBeenCalledWith('my-dataset', {
      aclMode: 'private',
    })
  })

  test('shows message when dataset is already in the specified mode', async () => {
    mockListDatasets.mockResolvedValue([{aclMode: 'private', name: 'my-dataset'}] as never)

    const {stdout} = await testCommand(DatasetVisibilitySetCommand, ['my-dataset', 'private'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Dataset already in "private" mode')
    expect(mockEditDatasetAcl).not.toHaveBeenCalled()
  })

  test('shows error when dataset is not found', async () => {
    mockListDatasets.mockResolvedValue([{aclMode: 'public', name: 'other-dataset'}] as never)

    const {error} = await testCommand(DatasetVisibilitySetCommand, ['not-found', 'private'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Dataset "not-found" not found')
    expect(mockEditDatasetAcl).not.toHaveBeenCalled()
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error for invalid dataset name', async () => {
    const invalidDatasetName = 'invalid-dataset-name!'

    const {error} = await testCommand(
      DatasetVisibilitySetCommand,
      [invalidDatasetName, 'private'],
      {
        mocks: defaultMocks,
      },
    )

    expect(error?.message).toContain('Dataset name must only contain')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles error when listing datasets fails', async () => {
    mockListDatasets.mockRejectedValue(new Error('Failed to fetch datasets'))

    const {error} = await testCommand(DatasetVisibilitySetCommand, ['my-dataset', 'private'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Failed to list datasets: Failed to fetch datasets')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles error when editing dataset fails', async () => {
    mockListDatasets.mockResolvedValue([{aclMode: 'public', name: 'my-dataset'}] as never)
    mockEditDatasetAcl.mockRejectedValue(new Error('Failed to update dataset'))

    const {error} = await testCommand(DatasetVisibilitySetCommand, ['my-dataset', 'private'], {
      mocks: defaultMocks,
    })

    expect(error?.message).toContain('Failed to edit dataset: Failed to update dataset')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('shows error when no project ID is available', async () => {
    const {error} = await testCommand(DatasetVisibilitySetCommand, ['my-dataset', 'private'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })
})

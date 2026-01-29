import {testCommand} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {DeleteDocumentCommand} from '../delete.js'

const testProjectId = 'test-project'
const testDataset = 'production'

const defaultMocks = {
  cliConfig: {api: {dataset: testDataset, projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const mockTransaction = vi.hoisted(() => vi.fn())
const mockGetProjectCliClient = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    transaction: mockTransaction,
  }),
)

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual('@sanity/cli-core')
  return {
    ...actual,
    getProjectCliClient: mockGetProjectCliClient,
  }
})

describe('#documents:delete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('deletes a single document successfully', async () => {
    const mockDelete = vi.fn()
    const mockCommit = vi.fn().mockResolvedValue({
      results: [{id: 'test-doc', operation: 'delete'}],
    })

    mockTransaction.mockReturnValue({
      commit: mockCommit,
      delete: mockDelete,
    })

    const {stdout} = await testCommand(DeleteDocumentCommand, ['test-doc'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Deleted 1 document')
    expect(mockDelete).toHaveBeenCalledWith('test-doc')
    expect(mockCommit).toHaveBeenCalled()
  })

  test('deletes multiple documents successfully', async () => {
    const mockDelete = vi.fn()
    const mockCommit = vi.fn().mockResolvedValue({
      results: [
        {id: 'doc1', operation: 'delete'},
        {id: 'doc2', operation: 'delete'},
        {id: 'doc3', operation: 'delete'},
      ],
    })

    mockTransaction.mockReturnValue({
      commit: mockCommit,
      delete: mockDelete,
    })

    const {stdout} = await testCommand(DeleteDocumentCommand, ['doc1', 'doc2', 'doc3'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Deleted 3 documents')
    expect(mockDelete).toHaveBeenCalledWith('doc1')
    expect(mockDelete).toHaveBeenCalledWith('doc2')
    expect(mockDelete).toHaveBeenCalledWith('doc3')
    expect(mockCommit).toHaveBeenCalled()
  })

  test('handles documents not found', async () => {
    const mockDelete = vi.fn()
    const mockCommit = vi.fn().mockResolvedValue({
      results: [{id: 'doc1', operation: 'delete'}],
    })
    mockTransaction.mockReturnValue({
      commit: mockCommit,
      delete: mockDelete,
    })

    const {error} = await testCommand(DeleteDocumentCommand, ['doc1', 'nonexistent-doc'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Document not found: nonexistent-doc')
    expect(mockDelete).toHaveBeenCalledWith('doc1')
    expect(mockDelete).toHaveBeenCalledWith('nonexistent-doc')
    expect(mockCommit).toHaveBeenCalled()
  })

  test('uses custom dataset when --dataset flag is provided', async () => {
    const mockDelete = vi.fn()
    const mockCommit = vi.fn().mockResolvedValue({
      results: [{id: 'test-doc', operation: 'delete'}],
    })
    mockTransaction.mockReturnValue({
      commit: mockCommit,
      delete: mockDelete,
    })

    await testCommand(DeleteDocumentCommand, ['test-doc', '--dataset', 'staging'], {
      mocks: defaultMocks,
    })

    expect(mockDelete).toHaveBeenCalledWith('test-doc')
    // Verify that the projectApiClient was called with the staging dataset
    expect(mockGetProjectCliClient).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: 'staging',
        projectId: testProjectId,
      }),
    )
  })

  test('throws error when no project ID is configured', async () => {
    const {error} = await testCommand(DeleteDocumentCommand, ['test-doc'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {dataset: testDataset, projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no dataset is configured and none provided', async () => {
    const {error} = await testCommand(DeleteDocumentCommand, ['test-doc'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {dataset: undefined, projectId: testProjectId}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No dataset specified')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles transaction errors gracefully', async () => {
    const mockDelete = vi.fn()
    const mockCommit = vi.fn().mockRejectedValue(new Error('Transaction failed'))
    mockTransaction.mockReturnValue({
      commit: mockCommit,
      delete: mockDelete,
    })

    const {error} = await testCommand(DeleteDocumentCommand, ['test-doc'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete 1 document: Transaction failed')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockDelete).toHaveBeenCalledWith('test-doc')
  })

  test('requires document ID argument', async () => {
    const {error} = await testCommand(DeleteDocumentCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing 1 required arg')
  })

  test('shows singular message when deleting one document', async () => {
    const mockDelete = vi.fn()
    const mockCommit = vi.fn().mockResolvedValue({
      results: [{id: 'test-doc', operation: 'delete'}],
    })
    mockTransaction.mockReturnValue({
      commit: mockCommit,
      delete: mockDelete,
    })

    const {stdout} = await testCommand(DeleteDocumentCommand, ['test-doc'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Deleted 1 document')
    expect(stdout).not.toContain('documents')
  })

  test('shows plural message when deleting multiple documents', async () => {
    const mockDelete = vi.fn()
    const mockCommit = vi.fn().mockResolvedValue({
      results: [
        {id: 'doc1', operation: 'delete'},
        {id: 'doc2', operation: 'delete'},
      ],
    })
    mockTransaction.mockReturnValue({
      commit: mockCommit,
      delete: mockDelete,
    })

    const {stdout} = await testCommand(DeleteDocumentCommand, ['doc1', 'doc2'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('Deleted 2 documents')
  })
})

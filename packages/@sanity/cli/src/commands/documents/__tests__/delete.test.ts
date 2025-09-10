import {runCommand} from '@oclif/test'
import {getCliConfig, getProjectCliClient} from '@sanity/cli-core'
import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {DeleteDocumentCommand} from '../delete.js'

// Mock the config functions
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
      dataset: 'production',
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../../../cli-core/src/services/apiClient.js', () => ({
  getProjectCliClient: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

// Mock the project API client
const mockTransaction = vi.fn()
const mockCommit = vi.fn()
const mockDelete = vi.fn()

// Get the mocked functions
const mockedGetCliConfig = vi.mocked(getCliConfig)
const mockedGetProjectCliClient = vi.mocked(getProjectCliClient)

describe('documents delete', () => {
  beforeEach(() => {
    // Setup transaction chain
    mockDelete.mockReturnValue({
      commit: mockCommit,
      delete: mockDelete,
    })
    mockTransaction.mockReturnValue({
      commit: mockCommit,
      delete: mockDelete,
    })

    mockedGetProjectCliClient.mockResolvedValue({
      transaction: mockTransaction,
    } as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockReset()
    mockCommit.mockReset()
    mockDelete.mockReset()
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['documents delete', '--help'])

    expect(stdout).toMatchInlineSnapshot(`
      "Delete one or more documents from the projects configured dataset

      USAGE
        $ sanity documents delete ID... [IDS...] [--dataset <value>]

      ARGUMENTS
        ID...   Document ID to delete
        IDS...  Additional document IDs to delete

      FLAGS
        --dataset=<value>  NAME to override dataset

      DESCRIPTION
        Delete one or more documents from the projects configured dataset

      EXAMPLES
        Delete the document with the ID "myDocId"

          $ sanity documents delete myDocId

        ID wrapped in double or single quote works equally well

          $ sanity documents delete 'myDocId'

        Delete document with ID "someDocId" from dataset "blog"

          $ sanity documents delete --dataset=blog someDocId

        Delete the document with ID "doc1" and "doc2"

          $ sanity documents delete doc1 doc2

      "
    `)
  })

  test('deletes a single document successfully', async () => {
    mockCommit.mockResolvedValue({
      results: [{id: 'test-doc', operation: 'delete'}],
    })

    const {stdout} = await testCommand(DeleteDocumentCommand, ['test-doc'])

    expect(stdout).toContain('Deleted 1 document')
    expect(mockDelete).toHaveBeenCalledWith('test-doc')
    expect(mockCommit).toHaveBeenCalled()
  })

  test('deletes multiple documents successfully', async () => {
    mockCommit.mockResolvedValue({
      results: [
        {id: 'doc1', operation: 'delete'},
        {id: 'doc2', operation: 'delete'},
        {id: 'doc3', operation: 'delete'},
      ],
    })

    const {stdout} = await testCommand(DeleteDocumentCommand, ['doc1', 'doc2', 'doc3'])

    expect(stdout).toContain('Deleted 3 documents')
    expect(mockDelete).toHaveBeenCalledWith('doc1')
    expect(mockDelete).toHaveBeenCalledWith('doc2')
    expect(mockDelete).toHaveBeenCalledWith('doc3')
    expect(mockCommit).toHaveBeenCalled()
  })

  test('handles documents not found', async () => {
    mockCommit.mockResolvedValue({
      results: [{id: 'doc1', operation: 'delete'}],
    })

    const {error} = await testCommand(DeleteDocumentCommand, ['doc1', 'nonexistent-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Document not found: nonexistent-doc')
    expect(mockDelete).toHaveBeenCalledWith('doc1')
    expect(mockDelete).toHaveBeenCalledWith('nonexistent-doc')
    expect(mockCommit).toHaveBeenCalled()
  })

  test('uses custom dataset when --dataset flag is provided', async () => {
    mockCommit.mockResolvedValue({
      results: [{id: 'test-doc', operation: 'delete'}],
    })

    await testCommand(DeleteDocumentCommand, ['test-doc', '--dataset', 'staging'])

    expect(mockDelete).toHaveBeenCalledWith('test-doc')
    // Verify that the getProjectCliClient was called with the staging dataset
    expect(mockedGetProjectCliClient).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: 'staging',
        projectId: 'test-project',
      }),
    )
  })

  test('throws error when no project ID is configured', async () => {
    mockedGetCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: undefined,
      },
    })

    const {error} = await testCommand(DeleteDocumentCommand, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)

    // Restore the original mock for other tests
    mockedGetCliConfig.mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: 'test-project',
      },
    })
  })

  test('throws error when no dataset is configured and none provided', async () => {
    mockedGetCliConfig.mockResolvedValueOnce({
      api: {
        dataset: undefined,
        projectId: 'test-project',
      },
    })

    const {error} = await testCommand(DeleteDocumentCommand, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No dataset specified')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles transaction errors gracefully', async () => {
    mockCommit.mockRejectedValue(new Error('Transaction failed'))

    const {error} = await testCommand(DeleteDocumentCommand, ['test-doc'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete 1 document: Transaction failed')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockDelete).toHaveBeenCalledWith('test-doc')
  })

  test('requires document ID argument', async () => {
    const {error} = await testCommand(DeleteDocumentCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing 1 required arg')
  })

  test('shows singular message when deleting one document', async () => {
    mockCommit.mockResolvedValue({
      results: [{id: 'test-doc', operation: 'delete'}],
    })

    const {stdout} = await testCommand(DeleteDocumentCommand, ['test-doc'])

    expect(stdout).toContain('Deleted 1 document')
    expect(stdout).not.toContain('documents')
  })

  test('shows plural message when deleting multiple documents', async () => {
    mockCommit.mockResolvedValue({
      results: [
        {id: 'doc1', operation: 'delete'},
        {id: 'doc2', operation: 'delete'},
      ],
    })

    const {stdout} = await testCommand(DeleteDocumentCommand, ['doc1', 'doc2'])

    expect(stdout).toContain('Deleted 2 documents')
  })
})

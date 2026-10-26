import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {contextDocument} from '../../__tests__/fixtures.js'
import {ListDocumentsCommand} from '../list.js'

const mockDocumentsList = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

const {chunks: _chunks, ...document} = contextDocument

describe('context documents list', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {documents: {list: mockDocumentsList}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lists every page of documents in a table', async () => {
    mockDocumentsList
      .mockResolvedValueOnce({data: [document], nextCursor: 'cursor-2'})
      .mockResolvedValueOnce({
        data: [{...document, id: 'document-file', sourceType: 'files', url: null}],
        nextCursor: null,
      })

    const {error, stdout} = await testCommand(ListDocumentsCommand, ['kb-abc123'])

    if (error) throw error
    expect(mockDocumentsList).toHaveBeenNthCalledWith(1, {cursor: undefined})
    expect(mockDocumentsList).toHaveBeenNthCalledWith(2, {cursor: 'cursor-2'})
    expect(stdout).toContain('document-def456')
    expect(stdout).toContain('https://example.com/docs/refunds')
    expect(stdout).toContain('document-file')
  })

  test('filters by source and state', async () => {
    mockDocumentsList.mockResolvedValue({data: [document], nextCursor: null})

    const {error} = await testCommand(ListDocumentsCommand, [
      'kb-abc123',
      '--source',
      'source-def456',
      '--state',
      'missing',
    ])

    if (error) throw error
    expect(mockDocumentsList).toHaveBeenCalledWith({
      cursor: undefined,
      source: 'source-def456',
      state: 'missing',
    })
  })

  test('accepts every document state the client defines as a --state value', () => {
    expect(ListDocumentsCommand.flags.state.options).toEqual(['active', 'deleted', 'missing'])
  })

  test('outputs JSON with --json', async () => {
    mockDocumentsList.mockResolvedValue({data: [document], nextCursor: null})

    const {error, stdout} = await testCommand(ListDocumentsCommand, ['kb-abc123', '--json'])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual([document])
  })

  test('says when there are no documents', async () => {
    mockDocumentsList.mockResolvedValue({data: [], nextCursor: null})

    const {error, stdout} = await testCommand(ListDocumentsCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('No documents found')
  })

  test('errors with a friendly message on 404', async () => {
    mockDocumentsList.mockRejectedValue(httpError(404))

    const {error} = await testCommand(ListDocumentsCommand, ['kb-missing'])

    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockDocumentsList.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(ListDocumentsCommand, ['kb-abc123'])

    expect(error?.message).toContain('Failed to list documents: Server error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

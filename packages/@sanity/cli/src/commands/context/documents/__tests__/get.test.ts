import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {contextDocument} from '../../__tests__/fixtures.js'
import {GetDocumentCommand} from '../get.js'

const mockDocumentsGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context documents get', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {documents: {get: mockDocumentsGet}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints document details', async () => {
    mockDocumentsGet.mockResolvedValue(contextDocument)

    const {error, stdout} = await testCommand(GetDocumentCommand, ['kb-abc123', 'document-def456'])

    if (error) throw error
    expect(mockDocumentsGet).toHaveBeenCalledWith({documentId: 'document-def456'})
    expect(stdout).toContain('Title:       Refunds')
    expect(stdout).toContain('Source:      source-def456')
    expect(stdout).toContain('Conversion:  converted')
    expect(stdout).toContain('Chunks:      1')
  })

  test('prints a conversion error and missing values', async () => {
    mockDocumentsGet.mockResolvedValue({
      ...contextDocument,
      chunks: [],
      conversion: 'failed',
      conversionError: 'Encrypted PDF',
      mime: null,
      sizeBytes: null,
      url: null,
    })

    const {error, stdout} = await testCommand(GetDocumentCommand, ['kb-abc123', 'document-def456'])

    if (error) throw error
    expect(stdout).toContain('Conversion:  failed: Encrypted PDF')
    expect(stdout).toContain('URL:         -')
    expect(stdout).toContain('MIME type:   -')
  })

  test('outputs JSON with --json', async () => {
    mockDocumentsGet.mockResolvedValue(contextDocument)

    const {error, stdout} = await testCommand(GetDocumentCommand, [
      'kb-abc123',
      'document-def456',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(contextDocument)
  })

  test('errors with a friendly message on 404', async () => {
    mockDocumentsGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(GetDocumentCommand, ['kb-abc123', 'document-missing'])

    expect(error?.message).toContain(
      'Document "document-missing" not found on knowledge base "kb-abc123"',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockDocumentsGet.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(GetDocumentCommand, ['kb-abc123', 'document-def456'])

    expect(error?.message).toContain('Failed to get document: Server error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

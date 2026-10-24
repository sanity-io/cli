import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {parseArguments} from '../../../../util/parseArguments.js'
import {DocumentContentCommand} from '../content.js'

const mockDocumentsContent = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockWriteFile = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {...actual, writeFile: mockWriteFile}
})

describe('context documents content', () => {
  const isTTY = process.stdout.isTTY

  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {documents: {content: mockDocumentsContent}},
    })
    mockWriteFile.mockResolvedValue(undefined)
  })

  afterEach(() => {
    process.stdout.isTTY = isTTY
    vi.clearAllMocks()
  })

  test('prints the markdown by default', async () => {
    mockDocumentsContent.mockResolvedValue('# Refunds\nWithin 10 days.\n')

    const {error, stdout} = await testCommand(DocumentContentCommand, [
      'kb-abc123',
      'document-def456',
    ])

    if (error) throw error
    expect(mockDocumentsContent).toHaveBeenCalledWith({
      documentId: 'document-def456',
      format: 'markdown',
    })
    expect(stdout).toBe('# Refunds\nWithin 10 days.\n')
  })

  test('passes the format and a line range', async () => {
    mockDocumentsContent.mockResolvedValue('Within 10 days.')

    const {error} = await testCommand(DocumentContentCommand, [
      'kb-abc123',
      'document-def456',
      '--format',
      'plain',
      '--lines',
      ' 10-20 ',
    ])

    if (error) throw error
    expect(mockDocumentsContent).toHaveBeenCalledWith({
      documentId: 'document-def456',
      format: 'plain',
      lines: '10-20',
    })
  })

  test('passes a chunk', async () => {
    mockDocumentsContent.mockResolvedValue('Within 10 days.')

    const {error} = await testCommand(DocumentContentCommand, [
      'kb-abc123',
      'document-def456',
      '--chunk',
      'chunk-1',
    ])

    if (error) throw error
    expect(mockDocumentsContent).toHaveBeenCalledWith({
      chunk: 'chunk-1',
      documentId: 'document-def456',
      format: 'markdown',
    })
  })

  test.each(['abc', '10-', '1:5'])('rejects --lines %s', async (lines) => {
    const {error} = await testCommand(DocumentContentCommand, [
      'kb-abc123',
      'document-def456',
      '--lines',
      lines,
    ])

    expect(error?.message).toContain('`--lines` must be a line number or range')
    expect(mockDocumentsContent).not.toHaveBeenCalled()
  })

  test('writes the raw bytes to --output', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
    mockDocumentsContent.mockResolvedValue(bytes)

    const {error, stdout} = await testCommand(DocumentContentCommand, [
      'kb-abc123',
      'document-def456',
      '--format',
      'raw',
      '--output',
      'handbook.pdf',
    ])

    if (error) throw error
    expect(mockDocumentsContent).toHaveBeenCalledWith({
      documentId: 'document-def456',
      format: 'raw',
    })
    expect(mockWriteFile).toHaveBeenCalledWith('handbook.pdf', bytes)
    expect(stdout).toContain('Wrote handbook.pdf')
  })

  test('refuses to print raw bytes to a terminal', async () => {
    process.stdout.isTTY = true

    const {error} = await testCommand(DocumentContentCommand, [
      'kb-abc123',
      'document-def456',
      '--format',
      'raw',
    ])

    expect(error?.message).toContain('Write it to a file with --output, or pipe it')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockDocumentsContent).not.toHaveBeenCalled()
  })

  test('errors when the output file cannot be written', async () => {
    mockDocumentsContent.mockResolvedValue('# Refunds')
    mockWriteFile.mockRejectedValue(new Error('EACCES'))

    const {error} = await testCommand(DocumentContentCommand, [
      'kb-abc123',
      'document-def456',
      '--output',
      '/root/refunds.md',
    ])

    expect(error?.message).toContain('Failed to write "/root/refunds.md": EACCES')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('outputs the JSON view with --json', async () => {
    const view = {
      chunkId: null,
      content: '1: # Refunds',
      documentId: 'document-def456',
      slice: {end: 1, start: 1},
      totalLines: 12,
    }
    mockDocumentsContent.mockResolvedValue(view)

    const {error, stdout} = await testCommand(DocumentContentCommand, [
      'kb-abc123',
      'document-def456',
      '--lines',
      '1',
      '--json',
    ])

    if (error) throw error
    expect(mockDocumentsContent).toHaveBeenCalledWith({
      documentId: 'document-def456',
      format: 'json',
      lines: '1',
    })
    expect(JSON.parse(stdout)).toEqual(view)
  })

  test('rejects --json with --format', async () => {
    const previousExitCode = process.exitCode
    try {
      const {stdout} = await testCommand(DocumentContentCommand, [
        'kb-abc123',
        'document-def456',
        '--format',
        'plain',
        '--json',
      ])

      expect(JSON.parse(stdout)).toMatchObject({
        error: {message: expect.stringContaining('cannot be combined with --format or --output')},
      })
      expect(process.exitCode).toBe(2)
      expect(mockDocumentsContent).not.toHaveBeenCalled()
    } finally {
      process.exitCode = previousExitCode
    }
  })

  test('errors with a friendly message on 404', async () => {
    mockDocumentsContent.mockRejectedValue(httpError(404))

    const {error} = await testCommand(DocumentContentCommand, ['kb-abc123', 'document-missing'])

    expect(error?.message).toContain(
      'Document "document-missing" not found on knowledge base "kb-abc123"',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockDocumentsContent.mockRejectedValue(httpError(409, 'The document is not converted'))

    const {error} = await testCommand(DocumentContentCommand, ['kb-abc123', 'document-def456'])

    expect(error?.message).toContain(
      'Failed to get document content: The document is not converted',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('redacts the output path from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'documents',
        'content',
        'kb-abc123',
        'document-def456',
        '--output=/Users/private/handbook.pdf',
        '--format=raw',
      ],
      DocumentContentCommand.telemetry,
    )

    expect(result.extraArguments).toEqual(['--output', '--format=raw'])
  })
})

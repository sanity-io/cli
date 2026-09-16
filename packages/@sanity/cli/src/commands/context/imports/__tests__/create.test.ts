import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {parseArguments} from '../../../../util/parseArguments.js'
import {CreateImportCommand} from '../create.js'

const mockImportsCreate = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockReadFile = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    spinner: vi.fn().mockReturnValue({
      fail: vi.fn(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
    }),
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {...actual, readFile: mockReadFile}
})

describe('context imports create', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {imports: {create: mockImportsCreate}}})
    mockImportsCreate.mockResolvedValue({jobId: 'job-def456'})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('creates a text import', async () => {
    const {error, stdout} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--text',
      'Refunds are processed within 5 days',
      '--title',
      '  Refund policy  ',
    ])

    if (error) throw error
    expect(stdout).toContain('Job ID: job-def456')
    expect(stdout).toContain('sanity context jobs get kb-abc123 job-def456')
    expect(mockImportsCreate).toHaveBeenCalledWith({
      content: 'Refunds are processed within 5 days',
      title: 'Refund policy',
      type: 'text',
    })
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('passes a valid content type for text imports', async () => {
    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--text',
      'Plain content',
      '--title',
      'Notes',
      '--content-type',
      'text/plain',
    ])

    if (error) throw error
    expect(mockImportsCreate).toHaveBeenCalledWith(
      expect.objectContaining({contentType: 'text/plain', type: 'text'}),
    )
  })

  test('errors when a text import is missing --title', async () => {
    const {error} = await testCommand(CreateImportCommand, ['kb-abc123', '--text', 'Content'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Title is required for text imports')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('errors when a text import has an unsupported content type', async () => {
    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--text',
      'Content',
      '--title',
      'Notes',
      '--content-type',
      'application/json',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('text/markdown and text/plain')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('creates a file import from a local path', async () => {
    const fileContent = Buffer.from('file bytes')
    mockReadFile.mockResolvedValue(fileContent)

    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--file',
      './docs/handbook.pdf',
      '--content-type',
      'application/pdf',
    ])

    if (error) throw error
    expect(mockReadFile).toHaveBeenCalledWith('./docs/handbook.pdf')
    expect(mockImportsCreate).toHaveBeenCalledWith({
      contentType: 'application/pdf',
      file: fileContent,
      filename: 'handbook.pdf',
      type: 'file',
    })
  })

  test('infers content type from the file extension when --content-type is omitted', async () => {
    const fileContent = Buffer.from('%PDF-1.7')
    mockReadFile.mockResolvedValue(fileContent)

    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--file',
      './docs/handbook.pdf',
    ])

    if (error) throw error
    expect(mockImportsCreate).toHaveBeenCalledWith({
      contentType: 'application/pdf',
      file: fileContent,
      filename: 'handbook.pdf',
      type: 'file',
    })
  })

  test('infers text/markdown for .md files', async () => {
    const fileContent = Buffer.from('# Notes')
    mockReadFile.mockResolvedValue(fileContent)

    const {error} = await testCommand(CreateImportCommand, ['kb-abc123', '--file', '/tmp/notes.md'])

    if (error) throw error
    expect(mockImportsCreate).toHaveBeenCalledWith(
      expect.objectContaining({contentType: 'text/markdown', filename: 'notes.md'}),
    )
  })

  test('falls back to application/octet-stream for unknown extensions', async () => {
    const fileContent = Buffer.from([0x00, 0x01])
    mockReadFile.mockResolvedValue(fileContent)

    const {error} = await testCommand(CreateImportCommand, ['kb-abc123', '--file', './data.bin'])

    if (error) throw error
    expect(mockImportsCreate).toHaveBeenCalledWith(
      expect.objectContaining({contentType: 'application/octet-stream', filename: 'data.bin'}),
    )
  })

  test('errors when --content-type is empty', async () => {
    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--file',
      './docs/handbook.pdf',
      '--content-type',
      '',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('`--content-type` cannot be empty')
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('trims whitespace around --content-type', async () => {
    const fileContent = Buffer.from('plain text')
    mockReadFile.mockResolvedValue(fileContent)

    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--file',
      './docs/notes.bin',
      '--content-type',
      '  text/plain  ',
    ])

    if (error) throw error
    expect(mockImportsCreate).toHaveBeenCalledWith(
      expect.objectContaining({contentType: 'text/plain', type: 'file'}),
    )
  })

  test('errors when the file cannot be read', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT: no such file'))

    const {error} = await testCommand(CreateImportCommand, ['kb-abc123', '--file', './missing.pdf'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to read file "./missing.pdf"')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('creates a crawl import from a URL', async () => {
    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--url',
      'https://example.com/docs',
    ])

    if (error) throw error
    expect(mockImportsCreate).toHaveBeenCalledWith({
      type: 'crawl',
      url: 'https://example.com/docs',
    })
  })

  test('creates a dataset import from a GROQ query', async () => {
    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--query',
      '*[_type == "article"]',
      '--sanity-project',
      'proj123',
      '--sanity-dataset',
      'production',
    ])

    if (error) throw error
    expect(mockImportsCreate).toHaveBeenCalledWith({
      query: '*[_type == "article"]',
      sanityDatasetId: 'production',
      sanityProjectId: 'proj123',
      type: 'dataset',
    })
  })

  test('errors when a dataset import is missing --sanity-project or --sanity-dataset', async () => {
    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--query',
      '*[_type == "article"]',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('--sanity-project and --sanity-dataset')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('errors when no source flag is provided', async () => {
    const {error} = await testCommand(CreateImportCommand, ['kb-abc123'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('exactly one of --text, --file, --url or --query')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('errors when two source flags are combined', async () => {
    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--text',
      'Content',
      '--url',
      'https://example.com',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('errors when --text is empty, before requiring --title', async () => {
    const {error} = await testCommand(CreateImportCommand, ['kb-abc123', '--text', ''])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('--text cannot be empty')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('errors when --url is whitespace-only', async () => {
    const {error} = await testCommand(CreateImportCommand, ['kb-abc123', '--url', '  '])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('--url cannot be empty')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('errors when --file is empty', async () => {
    const {error} = await testCommand(CreateImportCommand, ['kb-abc123', '--file', ''])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('--file cannot be empty')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('errors when --query is empty', async () => {
    const {error} = await testCommand(CreateImportCommand, ['kb-abc123', '--query', ''])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('--query cannot be empty')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('errors when --content-type is combined with --url', async () => {
    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--url',
      'https://example.com',
      '--content-type',
      'text/html',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('--content-type flag only applies to --text and --file')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('errors when --content-type is combined with --query', async () => {
    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--query',
      '*[_type == "article"]',
      '--sanity-project',
      'proj123',
      '--sanity-dataset',
      'production',
      '--content-type',
      'text/plain',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('--content-type flag only applies to --text and --file')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockImportsCreate).not.toHaveBeenCalled()
  })

  test('errors with a friendly message on 404', async () => {
    mockImportsCreate.mockRejectedValue(httpError(404))

    const {error} = await testCommand(CreateImportCommand, [
      'kb-missing',
      '--url',
      'https://example.com',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockImportsCreate.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(CreateImportCommand, [
      'kb-abc123',
      '--url',
      'https://example.com',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to create import')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('redacts content-bearing flags from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'imports',
        'create',
        'kb-abc123',
        '--text=Secret content',
        '--title=Internal notes',
        '--content-type=text/plain',
      ],
      CreateImportCommand.telemetry,
    )

    expect(result.extraArguments).toEqual(['--text', '--title', '--content-type=text/plain'])
  })

  test('redacts file, url and query flags from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'imports',
        'create',
        'kb-abc123',
        '--file=/Users/private/handbook.pdf',
        '--url=https://intranet.example.com',
        '--query=*[_type == "secret"]',
      ],
      CreateImportCommand.telemetry,
    )

    expect(result.extraArguments).toEqual(['--file', '--url', '--query'])
  })
})

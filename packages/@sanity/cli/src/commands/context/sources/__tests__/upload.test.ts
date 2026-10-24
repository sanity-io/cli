import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {parseArguments} from '../../../../util/parseArguments.js'
import {UploadSourceCommand} from '../upload.js'

const mockSourcesUpload = vi.hoisted(() => vi.fn())
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

describe('context sources upload', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {sources: {upload: mockSourcesUpload}}})
    mockSourcesUpload.mockResolvedValue({jobId: 'job-def456', sourceId: 'source-files'})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('uploads a file to a source and prints the sync job', async () => {
    const fileContent = Buffer.from('PK')
    mockReadFile.mockResolvedValue(fileContent)

    const {error, stdout} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './docs.zip',
    ])

    if (error) throw error
    expect(mockSourcesUpload).toHaveBeenCalledWith({
      contentType: 'application/zip',
      file: fileContent,
      filename: 'docs.zip',
      sourceId: 'source-files',
    })
    expect(stdout).toContain('Job ID: job-def456')
    expect(stdout).toContain('sanity context jobs get kb-abc123 job-def456')
  })

  test('passes an explicit content type and prints nothing more without a job', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('bytes'))
    mockSourcesUpload.mockResolvedValue({jobId: null, sourceId: 'source-files'})

    const {error, stdout} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './notes',
      '--content-type',
      'text/plain',
    ])

    if (error) throw error
    expect(mockSourcesUpload).toHaveBeenCalledWith(
      expect.objectContaining({contentType: 'text/plain', filename: 'notes'}),
    )
    expect(stdout).not.toContain('Job ID')
  })

  test('falls back to application/octet-stream for unknown extensions', async () => {
    mockReadFile.mockResolvedValue(Buffer.from([0]))

    const {error} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './data.bin',
    ])

    if (error) throw error
    expect(mockSourcesUpload).toHaveBeenCalledWith(
      expect.objectContaining({contentType: 'application/octet-stream'}),
    )
  })

  test('errors when the file cannot be read', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const {error} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './missing.pdf',
    ])

    expect(error?.message).toContain('Failed to read file "./missing.pdf": ENOENT')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockSourcesUpload).not.toHaveBeenCalled()
  })

  test('errors on an empty --content-type', async () => {
    const {error} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './a.pdf',
      '--content-type',
      '',
    ])

    expect(error?.message).toContain('`--content-type` cannot be empty')
  })

  test('errors with a friendly message on 404', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('x'))
    mockSourcesUpload.mockRejectedValue(httpError(404))

    const {error} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-missing',
      '--file',
      './a.pdf',
    ])

    expect(error?.message).toContain(
      'Source "source-missing" not found on knowledge base "kb-abc123"',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the upload fails', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('x'))
    mockSourcesUpload.mockRejectedValue(new Error('File upload failed: 403 Forbidden'))

    const {error} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './a.pdf',
    ])

    expect(error?.message).toContain('Failed to upload file: File upload failed: 403 Forbidden')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('redacts the file path from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'sources',
        'upload',
        'kb-abc123',
        'source-files',
        '--file=/Users/private/handbook.pdf',
        '--content-type=application/pdf',
      ],
      UploadSourceCommand.telemetry,
    )

    expect(result.extraArguments).toEqual(['--file', '--content-type=application/pdf'])
  })
})

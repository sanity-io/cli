import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {parseArguments} from '../../../../util/parseArguments.js'
import {filesSource, heldSync, latestSync} from '../../__tests__/fixtures.js'
import {UploadSourceCommand} from '../upload.js'

const mockSourcesUpload = vi.hoisted(() => vi.fn())
const mockSourcesGet = vi.hoisted(() => vi.fn())
const mockWatchSourceSync = vi.hoisted(() => vi.fn())
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

vi.mock('../../../../actions/context/watchSourceSync.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../actions/context/watchSourceSync.js')>()
  return {...actual, watchSourceSync: mockWatchSourceSync}
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {...actual, readFile: mockReadFile}
})

describe('context sources upload', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {sources: {get: mockSourcesGet, upload: mockSourcesUpload}},
    })
    mockSourcesUpload.mockResolvedValue({jobId: 'job-def456', sourceId: 'source-files'})
    mockSourcesGet.mockResolvedValueOnce(filesSource).mockResolvedValue({
      ...filesSource,
      latestSync: {...latestSync, id: 'sync-new', status: 'running'},
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('uploads a file to a source and prints the sync it started', async () => {
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
    expect(stdout).toContain('Sync ID: sync-new (running)')
    expect(stdout).toContain('sanity context sources syncs get kb-abc123 source-files sync-new')
    expect(stdout).not.toContain('jobs get')
  })

  test('points at the source when the new sync is not visible yet', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('bytes'))
    mockSourcesGet.mockReset().mockResolvedValue(filesSource)

    const {error, stdout} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './notes.md',
    ])

    if (error) throw error
    expect(stdout).not.toContain('Sync ID')
    expect(stdout).toContain(
      'Track its sync with: sanity context sources get kb-abc123 source-files',
    )
  })

  test('points at the source when reading the new sync fails', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('bytes'))
    mockSourcesGet
      .mockReset()
      .mockResolvedValueOnce(filesSource)
      .mockRejectedValue(new Error('Network down'))

    const {error, stdout} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './notes.md',
    ])

    if (error) throw error
    expect(stdout).toContain(
      'Track its sync with: sanity context sources get kb-abc123 source-files',
    )
  })

  test('tells how to settle a sync that is already held', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('bytes'))
    mockSourcesGet
      .mockReset()
      .mockResolvedValueOnce({...filesSource, latestSync: null})
      .mockResolvedValue({...filesSource, latestSync: {...heldSync, heldDeletions: 1}})

    const {error, stdout} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './notes.md',
    ])

    if (error) throw error
    expect(stdout).toContain('Sync ID: sync-held (held)')
    expect(stdout).toContain("Sync held: it would delete 1 document it didn't find.")
    expect(stdout).toContain(
      'sanity context sources syncs confirm kb-abc123 source-def456 sync-held',
    )
    expect(stdout).toContain(
      'sanity context sources syncs discard kb-abc123 source-def456 sync-held',
    )
    expect(stdout).not.toContain('Track it with')
  })

  test('watches the new sync and reports a held one', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('bytes'))
    mockWatchSourceSync.mockResolvedValue(heldSync)

    const {error, stdout} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './notes.md',
      '--watch',
    ])

    if (error) throw error
    expect(mockWatchSourceSync).toHaveBeenCalledWith('kb-abc123', 'source-files', 'sync-ghi789')
    expect(stdout).toContain('Status:         held')
    expect(stdout).toContain("Sync held: it would delete 12 documents it didn't find.")
    expect(stdout).toContain(
      'sanity context sources syncs discard kb-abc123 source-def456 sync-held',
    )
  })

  test('watches a sync that completes', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('bytes'))
    mockSourcesGet.mockReset().mockResolvedValue({...filesSource, latestSync: null})
    mockWatchSourceSync.mockResolvedValue(latestSync)

    const {error, stdout} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './notes.md',
      '--watch',
    ])

    if (error) throw error
    expect(mockWatchSourceSync).toHaveBeenCalledWith('kb-abc123', 'source-files', null)
    expect(stdout).toContain('Status:         completed')
    expect(stdout).not.toContain('Sync held')
  })

  test('exits non-zero when the watched sync fails', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('bytes'))
    mockWatchSourceSync.mockResolvedValue({...latestSync, error: 'unreadable', status: 'failed'})

    const {error} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './notes.md',
      '--watch',
    ])

    expect(error?.message).toContain('Sync failed: unreadable')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when watching fails', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('bytes'))
    mockWatchSourceSync.mockRejectedValue(new Error('Network down'))

    const {error} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './notes.md',
      '--watch',
    ])

    expect(error?.message).toContain('Failed to watch sync: Network down')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('says the file is kept when a running sync refuses it', async () => {
    mockReadFile.mockResolvedValue(Buffer.from('bytes'))
    const conflict = httpError(409, 'Source source-files is already syncing.')
    Object.assign(conflict, {
      response: {
        ...(conflict as unknown as {response: object}).response,
        body: {code: 'syncInProgress'},
      },
    })
    mockSourcesUpload.mockRejectedValue(conflict)

    const {error} = await testCommand(UploadSourceCommand, [
      'kb-abc123',
      'source-files',
      '--file',
      './notes.md',
    ])

    expect(error?.message).toContain('The file was uploaded and kept')
    expect(error?.message).toContain('the source is already syncing')
    expect(error?.message).not.toContain('Failed to upload file')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('passes an explicit content type', async () => {
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
    expect(stdout).toContain('Sync ID: sync-new')
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
    mockSourcesGet.mockReset().mockRejectedValue(httpError(404))

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
    expect(mockSourcesUpload).not.toHaveBeenCalled()
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

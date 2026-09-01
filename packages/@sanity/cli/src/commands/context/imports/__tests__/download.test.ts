import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {DownloadImportCommand} from '../download.js'

const mockImportsDownload = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

const download = {
  expiresAt: '2026-08-01T01:00:00.000Z',
  url: 'https://storage.example.com/signed-url',
}

describe('context imports download', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {imports: {download: mockImportsDownload}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints the signed download URL', async () => {
    mockImportsDownload.mockResolvedValue(download)

    const {error, stdout} = await testCommand(DownloadImportCommand, ['kb-abc123', 'import-def456'])

    if (error) throw error
    expect(stdout).toContain('URL:     https://storage.example.com/signed-url')
    expect(stdout).toContain('Expires: 2026-08-01T01:00:00.000Z')
    expect(mockImportsDownload).toHaveBeenCalledWith({importId: 'import-def456'})
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('outputs JSON with --json', async () => {
    mockImportsDownload.mockResolvedValue(download)

    const {error, stdout} = await testCommand(DownloadImportCommand, [
      'kb-abc123',
      'import-def456',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(download)
  })

  test('errors with a friendly message on 404', async () => {
    mockImportsDownload.mockRejectedValue(httpError(404))

    const {error} = await testCommand(DownloadImportCommand, ['kb-abc123', 'import-missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Import "import-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockImportsDownload.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(DownloadImportCommand, ['kb-abc123', 'import-def456'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to get import download URL')
    expect(error?.oclif?.exit).toBe(1)
  })
})

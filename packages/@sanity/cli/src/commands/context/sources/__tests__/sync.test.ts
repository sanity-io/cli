import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {heldSync, latestSync, webSource} from '../../__tests__/fixtures.js'
import {SyncSourceCommand} from '../sync.js'

const mockSyncsCreate = vi.hoisted(() => vi.fn())
const mockSourcesGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockWatchSourceSync = vi.hoisted(() => vi.fn())

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

describe('context sources sync', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {sources: {get: mockSourcesGet, syncs: {create: mockSyncsCreate}}},
    })
    mockSyncsCreate.mockResolvedValue({jobId: null, sourceId: 'source-def456'})
    mockSourcesGet.mockResolvedValue(webSource)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('requests a sync and points at the source', async () => {
    const {error, stdout} = await testCommand(SyncSourceCommand, ['kb-abc123', 'source-def456'])

    if (error) throw error
    expect(mockSyncsCreate).toHaveBeenCalledWith({sourceId: 'source-def456'})
    expect(mockSourcesGet).not.toHaveBeenCalled()
    expect(stdout).not.toContain('Job ID')
    expect(stdout).toContain('sanity context sources get kb-abc123 source-def456')
  })

  test('prints the job of a files sync that starts at once', async () => {
    mockSyncsCreate.mockResolvedValue({jobId: 'job-def456', sourceId: 'source-files'})

    const {error, stdout} = await testCommand(SyncSourceCommand, ['kb-abc123', 'source-files'])

    if (error) throw error
    expect(stdout).toContain('Job ID: job-def456')
  })

  test('outputs the accepted sync as JSON', async () => {
    const {error, stdout} = await testCommand(SyncSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual({jobId: null, sourceId: 'source-def456'})
  })

  test('watches the sync after the one the source had', async () => {
    mockWatchSourceSync.mockResolvedValue({...latestSync, id: 'sync-new'})

    const {error, stdout} = await testCommand(SyncSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--watch',
    ])

    if (error) throw error
    expect(mockWatchSourceSync).toHaveBeenCalledWith('kb-abc123', 'source-def456', 'sync-ghi789')
    expect(stdout).toContain('ID:             sync-new')
    expect(stdout).toContain('Status:         completed')
  })

  test('watches from no previous sync when the source has none', async () => {
    mockSourcesGet.mockResolvedValue({...webSource, latestSync: null})
    mockWatchSourceSync.mockResolvedValue(latestSync)

    const {error} = await testCommand(SyncSourceCommand, ['kb-abc123', 'source-def456', '--watch'])

    if (error) throw error
    expect(mockWatchSourceSync).toHaveBeenCalledWith('kb-abc123', 'source-def456', null)
  })

  test('tells how to settle a held sync', async () => {
    mockWatchSourceSync.mockResolvedValue(heldSync)

    const {error, stdout} = await testCommand(SyncSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--watch',
    ])

    if (error) throw error
    expect(stdout).toContain('it would delete 12 documents')
    expect(stdout).toContain(
      'sanity context sources syncs confirm kb-abc123 source-def456 sync-held',
    )
  })

  test('exits non-zero when the watched sync fails', async () => {
    mockWatchSourceSync.mockResolvedValue({...latestSync, error: 'crawl blocked', status: 'failed'})

    const {error} = await testCommand(SyncSourceCommand, ['kb-abc123', 'source-def456', '--watch'])

    expect(error?.message).toContain('Sync failed: crawl blocked')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('outputs the watched sync as JSON, and a JSON error when it fails', async () => {
    mockWatchSourceSync.mockResolvedValueOnce(latestSync)
    const ok = await testCommand(SyncSourceCommand, [
      'kb-abc123',
      'source-def456',
      '--watch',
      '--json',
    ])
    if (ok.error) throw ok.error
    expect(JSON.parse(ok.stdout)).toEqual(latestSync)

    const cancelled = {...latestSync, status: 'cancelled' as const}
    mockWatchSourceSync.mockResolvedValueOnce(cancelled)
    const previousExitCode = process.exitCode
    try {
      const failed = await testCommand(SyncSourceCommand, [
        'kb-abc123',
        'source-def456',
        '--watch',
        '--json',
      ])
      expect(JSON.parse(failed.stdout)).toEqual(cancelled)
      expect(process.exitCode).toBe(1)
    } finally {
      process.exitCode = previousExitCode
    }
  })

  test('errors when watching fails', async () => {
    mockWatchSourceSync.mockRejectedValue(new Error('Network down'))

    const {error} = await testCommand(SyncSourceCommand, ['kb-abc123', 'source-def456', '--watch'])

    expect(error?.message).toContain('Failed to watch sync: Network down')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors with a friendly message on 404', async () => {
    mockSyncsCreate.mockRejectedValue(httpError(404))

    const {error} = await testCommand(SyncSourceCommand, ['kb-abc123', 'source-missing'])

    expect(error?.message).toContain(
      'Source "source-missing" not found on knowledge base "kb-abc123"',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockSyncsCreate.mockRejectedValue(httpError(409, 'A sync of this source is running'))

    const {error} = await testCommand(SyncSourceCommand, ['kb-abc123', 'source-files'])

    expect(error?.message).toContain('Failed to start sync: A sync of this source is running')
    expect(error?.oclif?.exit).toBe(1)
  })
})

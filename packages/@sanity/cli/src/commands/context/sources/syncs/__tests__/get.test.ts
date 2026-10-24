import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../../test/helpers/httpError.js'
import {heldSync, latestSync} from '../../../__tests__/fixtures.js'
import {GetSyncCommand} from '../get.js'

const mockSyncsGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context sources syncs get', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {sources: {syncs: {get: mockSyncsGet}}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints sync details', async () => {
    mockSyncsGet.mockResolvedValue(latestSync)

    const {error, stdout} = await testCommand(GetSyncCommand, [
      'kb-abc123',
      'source-def456',
      'sync-ghi789',
    ])

    if (error) throw error
    expect(mockSyncsGet).toHaveBeenCalledWith({sourceId: 'source-def456', syncId: 'sync-ghi789'})
    expect(stdout).toContain('Status:         completed')
    expect(stdout).toContain('Upserted:       4')
    expect(stdout).toContain('Held deletions: -')
    expect(stdout).not.toContain('Sync held')
  })

  test('tells how to settle a held sync', async () => {
    mockSyncsGet.mockResolvedValue(heldSync)

    const {error, stdout} = await testCommand(GetSyncCommand, [
      'kb-abc123',
      'source-def456',
      'sync-held',
    ])

    if (error) throw error
    expect(stdout).toContain('Held deletions: 12')
    expect(stdout).toContain('Sync held: it would delete 12 documents')
    expect(stdout).toContain(
      'sanity context sources syncs confirm kb-abc123 source-def456 sync-held',
    )
    expect(stdout).toContain(
      'sanity context sources syncs discard kb-abc123 source-def456 sync-held',
    )
  })

  test('hints a held sync without a deletion count', async () => {
    mockSyncsGet.mockResolvedValue({...heldSync, heldDeletions: null})

    const {error, stdout} = await testCommand(GetSyncCommand, [
      'kb-abc123',
      'source-def456',
      'sync-held',
    ])

    if (error) throw error
    expect(stdout).toContain('Sync held: it would delete some documents')
  })

  test('outputs JSON with --json', async () => {
    mockSyncsGet.mockResolvedValue(latestSync)

    const {error, stdout} = await testCommand(GetSyncCommand, [
      'kb-abc123',
      'source-def456',
      'sync-ghi789',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(latestSync)
  })

  test('errors with a friendly message on 404', async () => {
    mockSyncsGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(GetSyncCommand, [
      'kb-abc123',
      'source-def456',
      'sync-missing',
    ])

    expect(error?.message).toContain('Sync "sync-missing" not found on source "source-def456"')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockSyncsGet.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(GetSyncCommand, ['kb-abc123', 'source-def456', 'sync-ghi789'])

    expect(error?.message).toContain('Failed to get sync: Server error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

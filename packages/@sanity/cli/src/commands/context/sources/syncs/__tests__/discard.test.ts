import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../../test/helpers/httpError.js'
import {heldSync} from '../../../__tests__/fixtures.js'
import {DiscardSyncCommand} from '../discard.js'

const mockSyncsDiscard = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockSpinner = vi.hoisted(() => ({
  fail: vi.fn(),
  start: vi.fn(),
  succeed: vi.fn(),
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {...actual, spinner: vi.fn(() => mockSpinner)}
})

describe('context sources syncs discard', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {sources: {syncs: {discard: mockSyncsDiscard}}},
    })
    mockSpinner.start.mockReturnValue(mockSpinner)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('settles a held sync', async () => {
    mockSyncsDiscard.mockResolvedValue({
      ...heldSync,
      documentsDeleted: 0,
      status: 'completed',
    })

    const {error, stdout} = await testCommand(DiscardSyncCommand, [
      'kb-abc123',
      'source-def456',
      'sync-held',
    ])

    if (error) throw error
    expect(mockSyncsDiscard).toHaveBeenCalledWith({sourceId: 'source-def456', syncId: 'sync-held'})
    expect(mockSpinner.succeed).toHaveBeenCalledWith('Sync discarded')
    expect(stdout).toContain('Status: completed')
  })

  test('errors with a friendly message on 404', async () => {
    mockSyncsDiscard.mockRejectedValue(httpError(404))

    const {error} = await testCommand(DiscardSyncCommand, [
      'kb-abc123',
      'source-def456',
      'sync-missing',
    ])

    expect(error?.message).toContain('Sync "sync-missing" not found on source "source-def456"')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the sync is not held', async () => {
    mockSyncsDiscard.mockRejectedValue(httpError(409, 'The sync is not held'))

    const {error} = await testCommand(DiscardSyncCommand, [
      'kb-abc123',
      'source-def456',
      'sync-ghi789',
    ])

    expect(error?.message).toContain('Failed to discard sync: The sync is not held')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockSpinner.fail).toHaveBeenCalled()
  })
})

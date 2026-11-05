import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {heldSync, latestSync} from '../../../commands/context/__tests__/fixtures.js'
import {formatSyncFailure, watchSourceSync} from '../watchSourceSync.js'

const mockWaitForSourceSync = vi.hoisted(() => vi.fn())
const mockSpinner = vi.hoisted(() => ({
  fail: vi.fn(),
  start: vi.fn(),
  succeed: vi.fn(),
  text: '',
  warn: vi.fn(),
}))

vi.mock('../waitForSourceSync.js', () => ({waitForSourceSync: mockWaitForSourceSync}))

vi.mock('@sanity/cli-core/ux', () => ({
  spinner: vi.fn(() => mockSpinner),
}))

describe('watchSourceSync', () => {
  beforeEach(() => {
    mockSpinner.start.mockReturnValue(mockSpinner)
    mockSpinner.text = ''
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('shows the sync status while polling and succeeds when it completes', async () => {
    mockWaitForSourceSync.mockImplementation(async (_kb, _source, {onPoll, previousSyncId}) => {
      expect(previousSyncId).toBe('sync-old')
      onPoll(null)
      expect(mockSpinner.text).toBe('Syncing source (waiting to start)')
      onPoll({...latestSync, status: 'running'})
      expect(mockSpinner.text).toBe('Syncing source (running)')
      return latestSync
    })

    const sync = await watchSourceSync('kb-abc123', 'source-def456', 'sync-old')

    expect(sync).toEqual(latestSync)
    expect(mockSpinner.succeed).toHaveBeenCalledWith('Sync completed')
  })

  test('warns when the sync is held', async () => {
    mockWaitForSourceSync.mockResolvedValue(heldSync)

    await watchSourceSync('kb-abc123', 'source-def456', null)

    expect(mockSpinner.warn).toHaveBeenCalledWith('Sync held for confirmation')
  })

  test('fails the spinner when the sync fails', async () => {
    mockWaitForSourceSync.mockResolvedValue({...latestSync, status: 'failed'})

    await watchSourceSync('kb-abc123', 'source-def456', null)

    expect(mockSpinner.fail).toHaveBeenCalledWith('Syncing source')
  })

  test('fails the spinner and rethrows when polling fails', async () => {
    mockWaitForSourceSync.mockRejectedValue(new Error('Network down'))

    await expect(watchSourceSync('kb-abc123', 'source-def456', null)).rejects.toThrow(
      'Network down',
    )
    expect(mockSpinner.fail).toHaveBeenCalledWith('Syncing source')
  })
})

describe('formatSyncFailure', () => {
  test('includes the sync error when there is one', () => {
    expect(formatSyncFailure({...latestSync, error: 'blocked', status: 'failed'})).toBe(
      'Sync failed: blocked',
    )
  })

  test('is just the status without an error', () => {
    expect(formatSyncFailure({...latestSync, status: 'cancelled'})).toBe('Sync cancelled')
  })
})

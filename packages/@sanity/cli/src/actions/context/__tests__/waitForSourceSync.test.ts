import {afterEach, describe, expect, test, vi} from 'vitest'

import {heldSync, latestSync, webSource} from '../../../commands/context/__tests__/fixtures.js'
import {waitForSourceSync} from '../waitForSourceSync.js'

const mockGetSource = vi.hoisted(() => vi.fn())

vi.mock('../../../services/context.js', () => ({getSource: mockGetSource}))

describe('waitForSourceSync', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('waits past the previous sync and the new one running until it settles', async () => {
    const onPoll = vi.fn()
    mockGetSource
      .mockResolvedValueOnce(webSource)
      .mockResolvedValueOnce({
        ...webSource,
        latestSync: {...latestSync, id: 'sync-new', status: 'running'},
      })
      .mockResolvedValueOnce({...webSource, latestSync: {...latestSync, id: 'sync-new'}})

    const sync = await waitForSourceSync('kb-abc123', 'source-def456', {
      onPoll,
      pollIntervalMs: 0,
      previousSyncId: 'sync-ghi789',
    })

    expect(sync).toEqual({...latestSync, id: 'sync-new'})
    expect(mockGetSource).toHaveBeenCalledWith('kb-abc123', 'source-def456')
    expect(onPoll).toHaveBeenNthCalledWith(1, null)
    expect(onPoll).toHaveBeenNthCalledWith(2, expect.objectContaining({status: 'running'}))
  })

  test('settles on a held sync, and on the first sync of a source that had none', async () => {
    mockGetSource
      .mockResolvedValueOnce({...webSource, latestSync: null})
      .mockResolvedValueOnce({...webSource, latestSync: heldSync})

    const sync = await waitForSourceSync('kb-abc123', 'source-def456', {
      pollIntervalMs: 0,
      previousSyncId: null,
    })

    expect(sync).toEqual(heldSync)
  })

  test('rethrows polling errors', async () => {
    mockGetSource.mockRejectedValue(new Error('Network down'))

    await expect(
      waitForSourceSync('kb-abc123', 'source-def456', {previousSyncId: null}),
    ).rejects.toThrow('Network down')
  })
})

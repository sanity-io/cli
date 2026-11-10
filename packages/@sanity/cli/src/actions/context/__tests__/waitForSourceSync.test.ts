import {afterEach, describe, expect, test, vi} from 'vitest'

import {heldSync, latestSync, webSource} from '../../../commands/context/__tests__/fixtures.js'
import {waitForSourceSync} from '../waitForSourceSync.js'

const mockGetSource = vi.hoisted(() => vi.fn())
const mockGetSync = vi.hoisted(() => vi.fn())
const mockGetJob = vi.hoisted(() => vi.fn())

vi.mock('../../../services/context.js', () => ({
  getJob: mockGetJob,
  getSource: mockGetSource,
  getSync: mockGetSync,
}))

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

    const sync = await waitForSourceSync(
      'kb-abc123',
      'source-def456',
      {previousSyncId: 'sync-ghi789'},
      {onPoll, pollIntervalMs: 0},
    )

    expect(sync).toEqual({...latestSync, id: 'sync-new'})
    expect(mockGetSource).toHaveBeenCalledWith('kb-abc123', 'source-def456')
    expect(onPoll).toHaveBeenNthCalledWith(1, null)
    expect(onPoll).toHaveBeenNthCalledWith(2, expect.objectContaining({status: 'running'}))
  })

  test('settles on a held sync, and on the first sync of a source that had none', async () => {
    mockGetSource
      .mockResolvedValueOnce({...webSource, latestSync: null})
      .mockResolvedValueOnce({...webSource, latestSync: heldSync})

    const sync = await waitForSourceSync(
      'kb-abc123',
      'source-def456',
      {previousSyncId: null},
      {pollIntervalMs: 0},
    )

    expect(sync).toEqual(heldSync)
  })

  test("follows the sync a request created by its ID, not the source's latest sync", async () => {
    mockGetSync
      .mockResolvedValueOnce({...latestSync, id: 'sync-mine', status: 'running'})
      .mockResolvedValueOnce({...latestSync, id: 'sync-mine'})

    const sync = await waitForSourceSync(
      'kb-abc123',
      'source-def456',
      {syncId: 'sync-mine'},
      {pollIntervalMs: 0},
    )

    expect(sync).toEqual({...latestSync, id: 'sync-mine'})
    expect(mockGetSync).toHaveBeenCalledWith('kb-abc123', 'source-def456', 'sync-mine')
    expect(mockGetSource).not.toHaveBeenCalled()
  })

  test('follows a files sync through its job, to the sync the job names', async () => {
    mockGetJob.mockResolvedValueOnce({
      id: 'job1',
      kind: 'sync',
      result: {status: 'held', syncId: 'sync-mine'},
      status: 'succeeded',
    })
    mockGetSync.mockResolvedValueOnce({...heldSync, id: 'sync-mine'})

    const sync = await waitForSourceSync(
      'kb-abc123',
      'source-def456',
      {jobId: 'job1'},
      {pollIntervalMs: 0},
    )

    expect(mockGetJob).toHaveBeenCalledWith('kb-abc123', 'job1')
    expect(sync).toEqual({...heldSync, id: 'sync-mine'})
  })

  test('a failed job that names no sync fails the wait', async () => {
    mockGetJob.mockResolvedValueOnce({error: 'boom', id: 'job1', status: 'failed'})

    await expect(
      waitForSourceSync('kb-abc123', 'source-def456', {jobId: 'job1'}, {pollIntervalMs: 0}),
    ).rejects.toThrow('Sync failed: boom')
  })

  test('rethrows polling errors', async () => {
    mockGetSource.mockRejectedValue(new Error('Network down'))

    await expect(
      waitForSourceSync('kb-abc123', 'source-def456', {previousSyncId: null}, {pollIntervalMs: 0}),
    ).rejects.toThrow('Network down')
  })
})

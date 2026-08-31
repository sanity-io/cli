import {afterEach, describe, expect, test, vi} from 'vitest'

import {succeededJob} from '../../../commands/context/__tests__/fixtures.js'
import {waitForJob} from '../waitForJob.js'

const mockGetJob = vi.hoisted(() => vi.fn())

vi.mock('../../../services/context.js', () => ({
  getJob: mockGetJob,
}))

describe('waitForJob', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('resolves immediately when the job is already terminal', async () => {
    mockGetJob.mockResolvedValue(succeededJob)

    const job = await waitForJob('kb-abc123', 'job-def456', {pollIntervalMs: 0})

    expect(job).toEqual(succeededJob)
    expect(mockGetJob).toHaveBeenCalledTimes(1)
    expect(mockGetJob).toHaveBeenCalledWith('kb-abc123', 'job-def456')
  })

  test('polls until the job reaches a terminal state, reporting progress', async () => {
    mockGetJob
      .mockResolvedValueOnce({...succeededJob, status: 'pending'})
      .mockResolvedValueOnce({...succeededJob, status: 'running'})
      .mockResolvedValueOnce(succeededJob)
    const onPoll = vi.fn()

    const job = await waitForJob('kb-abc123', 'job-def456', {onPoll, pollIntervalMs: 0})

    expect(job.status).toBe('succeeded')
    expect(mockGetJob).toHaveBeenCalledTimes(3)
    expect(onPoll).toHaveBeenCalledTimes(2)
    expect(onPoll).toHaveBeenNthCalledWith(1, expect.objectContaining({status: 'pending'}))
    expect(onPoll).toHaveBeenNthCalledWith(2, expect.objectContaining({status: 'running'}))
  })

  test.each(['succeeded', 'failed', 'cancelled'] as const)(
    'treats %s as terminal',
    async (status) => {
      mockGetJob.mockResolvedValue({...succeededJob, status})

      const job = await waitForJob('kb-abc123', 'job-def456', {pollIntervalMs: 0})

      expect(job.status).toBe(status)
      expect(mockGetJob).toHaveBeenCalledTimes(1)
    },
  )

  test('propagates polling errors', async () => {
    mockGetJob.mockRejectedValue(new Error('Server error'))

    await expect(waitForJob('kb-abc123', 'job-def456', {pollIntervalMs: 0})).rejects.toThrow(
      'Server error',
    )
  })
})

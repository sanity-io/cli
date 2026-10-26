import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {succeededJob} from '../../../commands/context/__tests__/fixtures.js'
import {formatJobFailure, watchJob} from '../watchJob.js'

const mockWaitForJob = vi.hoisted(() => vi.fn())
const mockSpinner = vi.hoisted(() => ({
  fail: vi.fn(),
  start: vi.fn(),
  succeed: vi.fn(),
  text: '',
}))

vi.mock('../waitForJob.js', () => ({waitForJob: mockWaitForJob}))

vi.mock('@sanity/cli-core/ux', () => ({
  spinner: vi.fn(() => mockSpinner),
}))

describe('watchJob', () => {
  beforeEach(() => {
    mockSpinner.start.mockReturnValue(mockSpinner)
    mockSpinner.text = ''
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('shows the job status while polling and the success text when done', async () => {
    mockWaitForJob.mockImplementation(async (_kb, _job, {onPoll}) => {
      onPoll({...succeededJob, status: 'running'})
      expect(mockSpinner.text).toBe('Building (running)')
      return succeededJob
    })

    const job = await watchJob('kb-abc123', 'job-def456', {
      label: 'Building',
      successText: 'Build succeeded',
    })

    expect(job).toEqual(succeededJob)
    expect(mockSpinner.succeed).toHaveBeenCalledWith('Build succeeded')
  })

  test('falls back to the label instead of the last polled status', async () => {
    mockWaitForJob.mockResolvedValue(succeededJob)

    await watchJob('kb-abc123', 'job-def456', {label: 'Waiting for job'})

    expect(mockSpinner.succeed).toHaveBeenCalledWith('Waiting for job')
  })

  test('fails the spinner when the job does not succeed', async () => {
    const failedJob = {...succeededJob, error: 'boom', status: 'failed' as const}
    mockWaitForJob.mockResolvedValue(failedJob)

    const job = await watchJob('kb-abc123', 'job-def456', {label: 'Building'})

    expect(job).toEqual(failedJob)
    expect(mockSpinner.fail).toHaveBeenCalledWith('Building')
    expect(mockSpinner.succeed).not.toHaveBeenCalled()
  })

  test('fails the spinner and rethrows when polling fails', async () => {
    mockWaitForJob.mockRejectedValue(new Error('Network down'))

    await expect(watchJob('kb-abc123', 'job-def456', {label: 'Building'})).rejects.toThrow(
      'Network down',
    )
    expect(mockSpinner.fail).toHaveBeenCalledWith('Building')
  })
})

describe('formatJobFailure', () => {
  test('includes the job error when there is one', () => {
    expect(formatJobFailure('Build', {...succeededJob, error: 'boom', status: 'failed'})).toBe(
      'Build failed: boom',
    )
  })

  test('omits the error when there is none', () => {
    expect(formatJobFailure('Build', {...succeededJob, status: 'cancelled'})).toBe(
      'Build cancelled',
    )
  })
})

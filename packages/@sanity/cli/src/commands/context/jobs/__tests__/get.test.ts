import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {succeededJob} from '../../__tests__/fixtures.js'
import {GetJobCommand} from '../get.js'

const mockJobsGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

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
      text: '',
    }),
  }
})

describe('context jobs get', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {jobs: {get: mockJobsGet}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints job status', async () => {
    mockJobsGet.mockResolvedValue(succeededJob)

    const {error, stdout} = await testCommand(GetJobCommand, ['kb-abc123', 'job-def456'])

    if (error) throw error
    expect(stdout).toContain('ID:        job-def456')
    expect(stdout).toContain('Status:    succeeded')
    expect(stdout).toContain('Started:   2026-08-01T00:00:00.000Z')
    expect(stdout).toContain('Completed: 2026-08-01T01:00:00.000Z')
    expect(stdout).toContain('Error:     -')
    expect(mockJobsGet).toHaveBeenCalledWith({jobId: 'job-def456'})
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('exits zero for a failed job without --watch', async () => {
    mockJobsGet.mockResolvedValue({...succeededJob, error: 'boom', status: 'failed'})

    const {error, stdout} = await testCommand(GetJobCommand, ['kb-abc123', 'job-def456'])

    if (error) throw error
    expect(stdout).toContain('Status:    failed')
    expect(stdout).toContain('Error:     boom')
  })

  test('outputs JSON with --json', async () => {
    mockJobsGet.mockResolvedValue(succeededJob)

    const {error, stdout} = await testCommand(GetJobCommand, ['kb-abc123', 'job-def456', '--json'])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(succeededJob)
  })

  test('waits for the job with --watch and succeeds', async () => {
    mockJobsGet.mockResolvedValue(succeededJob)

    const {error, stdout} = await testCommand(GetJobCommand, ['kb-abc123', 'job-def456', '--watch'])

    if (error) throw error
    expect(stdout).toContain('succeeded')
  })

  test('exits non-zero when a watched job fails', async () => {
    mockJobsGet.mockResolvedValue({...succeededJob, error: 'boom', status: 'failed'})

    const {error} = await testCommand(GetJobCommand, ['kb-abc123', 'job-def456', '--watch'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Job failed: boom')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors with a friendly message on 404', async () => {
    mockJobsGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(GetJobCommand, ['kb-abc123', 'job-missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Job "job-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockJobsGet.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(GetJobCommand, ['kb-abc123', 'job-def456'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to get job')
    expect(error?.oclif?.exit).toBe(1)
  })
})

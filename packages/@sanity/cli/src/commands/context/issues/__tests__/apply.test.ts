import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {succeededJob} from '../../__tests__/fixtures.js'
import {ApplyIssuesCommand} from '../apply.js'

const mockIssuesApply = vi.hoisted(() => vi.fn())
const mockJobsGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))

describe('context issues apply', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {issues: {apply: mockIssuesApply}, jobs: {get: mockJobsGet}},
    })
    mockIssuesApply.mockResolvedValue({jobId: 'job-def456'})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('applies one issue and prints the job ID with a tracking hint', async () => {
    const {error, stdout} = await testCommand(ApplyIssuesCommand, ['kb-abc123', 'issue.def456'])

    if (error) throw error
    expect(mockIssuesApply).toHaveBeenCalledWith({issueIds: ['issue.def456']})
    expect(stdout).toContain('Job ID: job-def456')
    expect(stdout).toContain('Track it with: sanity context jobs get kb-abc123 job-def456')
    expect(mockJobsGet).not.toHaveBeenCalled()
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('applies several issues in one batch, with flags between them', async () => {
    mockJobsGet.mockResolvedValue(succeededJob)

    const {error} = await testCommand(ApplyIssuesCommand, [
      'kb-abc123',
      'issue.def456',
      '--watch',
      'issue.ghi789',
      'issue.jkl012',
    ])

    if (error) throw error
    expect(mockIssuesApply).toHaveBeenCalledTimes(1)
    expect(mockIssuesApply).toHaveBeenCalledWith({
      issueIds: ['issue.def456', 'issue.ghi789', 'issue.jkl012'],
    })
  })

  test('waits for the apply with --watch and succeeds', async () => {
    mockJobsGet.mockResolvedValue(succeededJob)

    const {error} = await testCommand(ApplyIssuesCommand, ['kb-abc123', 'issue.def456', '--watch'])

    if (error) throw error
    expect(mockJobsGet).toHaveBeenCalledWith({jobId: 'job-def456'})
  })

  test('exits non-zero when a watched apply fails', async () => {
    mockJobsGet.mockResolvedValue({...succeededJob, error: 'boom', status: 'failed'})

    const {error} = await testCommand(ApplyIssuesCommand, ['kb-abc123', 'issue.def456', '--watch'])

    expect(error?.message).toContain('Apply failed: boom')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('exits non-zero when a watched apply is cancelled', async () => {
    mockJobsGet.mockResolvedValue({...succeededJob, status: 'cancelled'})

    const {error} = await testCommand(ApplyIssuesCommand, ['kb-abc123', 'issue.def456', '--watch'])

    expect(error?.message).toBe('Apply cancelled')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when polling a watched apply fails', async () => {
    mockJobsGet.mockRejectedValue(new Error('Network down'))

    const {error} = await testCommand(ApplyIssuesCommand, ['kb-abc123', 'issue.def456', '--watch'])

    expect(error?.message).toContain('Failed to watch apply job')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors with a friendly message on 404', async () => {
    mockIssuesApply.mockRejectedValue(httpError(404))

    const {error} = await testCommand(ApplyIssuesCommand, ['kb-missing', 'issue.def456'])

    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockIssuesApply.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(ApplyIssuesCommand, ['kb-abc123', 'issue.def456'])

    expect(error?.message).toContain('Failed to apply issues')
    expect(error?.oclif?.exit).toBe(1)
  })
})

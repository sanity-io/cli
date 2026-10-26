import {testCommand} from '@sanity/cli-test'
import {select} from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {conflictIssue, issue, knowledgeBase, succeededJob} from '../../__tests__/fixtures.js'
import {ResolveIssueCommand} from '../resolve.js'

const mockIssuesResolve = vi.hoisted(() => vi.fn())
const mockIssuesGet = vi.hoisted(() => vi.fn())
const mockKnowledgeBasesGet = vi.hoisted(() => vi.fn())
const mockJobsGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))

describe('context issues resolve', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {
        issues: {get: mockIssuesGet, resolve: mockIssuesResolve},
        jobs: {get: mockJobsGet},
        knowledgeBases: {get: mockKnowledgeBasesGet},
      },
    })
    mockKnowledgeBasesGet.mockResolvedValue(knowledgeBase)
    mockIssuesResolve.mockResolvedValue({issue: conflictIssue, jobId: 'job-def456'})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('resolves with --side and prints the rewrite job', async () => {
    const {error, stdout} = await testCommand(ResolveIssueCommand, [
      'kb-abc123',
      'issue.conflict789',
      '--side',
      '1',
    ])

    if (error) throw error
    expect(mockIssuesResolve).toHaveBeenCalledWith({issueId: 'issue.conflict789', resolution: 1})
    expect(mockIssuesGet).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
    expect(stdout).toContain('Issue resolved')
    expect(stdout).toContain('Job ID: job-def456')
    expect(stdout).toContain('Track it with: sanity context jobs get kb-abc123 job-def456')
    expect(mockJobsGet).not.toHaveBeenCalled()
  })

  test('prints no job when nothing is rewritten', async () => {
    mockIssuesResolve.mockResolvedValue({issue: conflictIssue, jobId: null})

    const {error, stdout} = await testCommand(ResolveIssueCommand, [
      'kb-abc123',
      'issue.conflict789',
      '--side',
      '0',
      '--watch',
    ])

    if (error) throw error
    expect(mockIssuesResolve).toHaveBeenCalledWith({issueId: 'issue.conflict789', resolution: 0})
    expect(stdout).toContain('Issue resolved')
    expect(stdout).not.toContain('Job ID')
    expect(mockJobsGet).not.toHaveBeenCalled()
  })

  test('rejects a negative --side', async () => {
    const {error} = await testCommand(ResolveIssueCommand, [
      'kb-abc123',
      'issue.conflict789',
      '--side=-1',
    ])

    expect(error?.message).toContain('Expected an integer greater than or equal to 0')
    expect(mockIssuesResolve).not.toHaveBeenCalled()
  })

  test('prompts for a side with the suggested side as default when interactive', async () => {
    mockIssuesGet.mockResolvedValue(conflictIssue)
    select.mockResolvedValueOnce(1)

    const {error} = await testCommand(ResolveIssueCommand, ['kb-abc123', 'issue.conflict789'], {
      mocks: {isInteractive: true},
    })

    if (error) throw error
    expect(select).toHaveBeenCalledWith({
      choices: [
        {name: '[0] Refunds are processed within 5 days.', value: 0},
        {name: '[1] Refunds are processed within 10 days.', value: 1},
      ],
      default: 1,
      message: 'Which side is correct?',
    })
    expect(mockIssuesResolve).toHaveBeenCalledWith({issueId: 'issue.conflict789', resolution: 1})
  })

  test('preselects the current side when re-resolving a resolved conflict', async () => {
    mockIssuesGet.mockResolvedValue({
      ...conflictIssue,
      resolution: 0,
      resolvedAt: '2026-08-02T00:00:00Z',
      resolvedBy: null,
      status: 'accepted',
    })
    select.mockResolvedValueOnce(0)

    const {error} = await testCommand(ResolveIssueCommand, ['kb-abc123', 'issue.conflict789'], {
      mocks: {isInteractive: true},
    })

    if (error) throw error
    expect(select).toHaveBeenCalledWith(expect.objectContaining({default: 0}))
  })

  test('errors when --side is missing in a non-interactive environment', async () => {
    const {error} = await testCommand(ResolveIssueCommand, ['kb-abc123', 'issue.conflict789'], {
      mocks: {isInteractive: false},
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing required flag side')
    expect(error?.oclif?.exit).toBe(2)
    expect(select).not.toHaveBeenCalled()
  })

  test('errors before prompting when the issue is not a conflict', async () => {
    mockIssuesGet.mockResolvedValue(issue)

    const {error} = await testCommand(ResolveIssueCommand, ['kb-abc123', 'issue.def456'], {
      mocks: {isInteractive: true},
    })

    expect(error?.message).toContain(
      'Only conflict issues can be resolved, "issue.def456" is of kind update_required',
    )
    expect(error?.oclif?.exit).toBe(1)
    expect(select).not.toHaveBeenCalled()
    expect(mockIssuesResolve).not.toHaveBeenCalled()
  })

  test('errors before prompting when the issue is dismissed', async () => {
    mockIssuesGet.mockResolvedValue({
      ...conflictIssue,
      resolvedAt: '2026-08-02T00:00:00Z',
      status: 'rejected',
    })

    const {error} = await testCommand(ResolveIssueCommand, ['kb-abc123', 'issue.conflict789'], {
      mocks: {isInteractive: true},
    })

    expect(error?.message).toBe(
      'Issue "issue.conflict789" is rejected (dismissed) and cannot be resolved',
    )
    expect(error?.oclif?.exit).toBe(1)
    expect(select).not.toHaveBeenCalled()
    expect(mockIssuesResolve).not.toHaveBeenCalled()
  })

  test('errors before prompting when the issue does not exist', async () => {
    mockIssuesGet.mockResolvedValue(null)

    const {error} = await testCommand(ResolveIssueCommand, ['kb-abc123', 'issue.missing'], {
      mocks: {isInteractive: true},
    })

    expect(error?.message).toContain(
      'Issue "issue.missing" not found on knowledge base "kb-abc123"',
    )
    expect(select).not.toHaveBeenCalled()
  })

  test('errors before prompting when the knowledge base does not exist', async () => {
    mockKnowledgeBasesGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(ResolveIssueCommand, ['kb-missing', 'issue.def456'], {
      mocks: {isInteractive: true},
    })

    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(select).not.toHaveBeenCalled()
  })

  test('errors before prompting when reading the issue fails', async () => {
    mockIssuesGet.mockRejectedValueOnce(new Error('Server error'))

    const {error} = await testCommand(ResolveIssueCommand, ['kb-abc123', 'issue.def456'], {
      mocks: {isInteractive: true},
    })

    expect(error?.message).toContain('Failed to get issue')
    expect(select).not.toHaveBeenCalled()
  })

  test('waits for the rewrite with --watch and succeeds', async () => {
    mockJobsGet.mockResolvedValue(succeededJob)

    const {error} = await testCommand(ResolveIssueCommand, [
      'kb-abc123',
      'issue.conflict789',
      '--side',
      '1',
      '--watch',
    ])

    if (error) throw error
    expect(mockJobsGet).toHaveBeenCalledWith({jobId: 'job-def456'})
  })

  test('exits non-zero when a watched rewrite fails', async () => {
    mockJobsGet.mockResolvedValue({...succeededJob, error: 'boom', status: 'failed'})

    const {error} = await testCommand(ResolveIssueCommand, [
      'kb-abc123',
      'issue.conflict789',
      '--side',
      '1',
      '--watch',
    ])

    expect(error?.message).toContain('Rewrite failed: boom')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('exits non-zero when a watched rewrite is cancelled', async () => {
    mockJobsGet.mockResolvedValue({...succeededJob, status: 'cancelled'})

    const {error} = await testCommand(ResolveIssueCommand, [
      'kb-abc123',
      'issue.conflict789',
      '--side',
      '1',
      '--watch',
    ])

    expect(error?.message).toBe('Rewrite cancelled')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when polling a watched rewrite fails', async () => {
    mockJobsGet.mockRejectedValueOnce(new Error('Network down'))

    const {error} = await testCommand(ResolveIssueCommand, [
      'kb-abc123',
      'issue.conflict789',
      '--side',
      '1',
      '--watch',
    ])

    expect(error?.message).toContain('Failed to watch rewrite job')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors with a friendly message on 404', async () => {
    mockIssuesResolve.mockRejectedValue(httpError(404))

    const {error} = await testCommand(ResolveIssueCommand, [
      'kb-abc123',
      'issue.missing',
      '--side',
      '1',
    ])

    expect(error?.message).toContain('Issue "issue.missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockIssuesResolve.mockRejectedValue(new Error('Index out of range'))

    const {error} = await testCommand(ResolveIssueCommand, [
      'kb-abc123',
      'issue.conflict789',
      '--side',
      '5',
    ])

    expect(error?.message).toContain('Failed to resolve issue: Index out of range')
    expect(error?.oclif?.exit).toBe(1)
  })
})

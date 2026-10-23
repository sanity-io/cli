import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {conflictIssue, issue, knowledgeBase} from '../../__tests__/fixtures.js'
import {GetIssueCommand} from '../get.js'

const mockIssuesGet = vi.hoisted(() => vi.fn())
const mockKnowledgeBasesGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context issues get', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {issues: {get: mockIssuesGet}, knowledgeBases: {get: mockKnowledgeBasesGet}},
    })
    mockKnowledgeBasesGet.mockResolvedValue(knowledgeBase)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints issue details', async () => {
    mockIssuesGet.mockResolvedValue(issue)

    const {error, stdout} = await testCommand(GetIssueCommand, ['kb-abc123', 'issue.def456'])

    if (error) throw error
    expect(stdout).toContain('ID:            issue.def456')
    expect(stdout).toContain('Kind:          update_required')
    expect(stdout).toContain('Scope:         billing/refunds')
    expect(stdout).toContain('Suggested fix: Update the refund window to 10 days.')
    expect(stdout).toContain('Resolution:    -')
    expect(stdout).not.toContain('Side')
    expect(mockIssuesGet).toHaveBeenCalledWith({issueId: 'issue.def456'})
  })

  test('prints indexed sides and the suggested side of a conflict', async () => {
    mockIssuesGet.mockResolvedValue(conflictIssue)

    const {error, stdout} = await testCommand(GetIssueCommand, ['kb-abc123', 'issue.conflict789'])

    if (error) throw error
    expect(stdout).toContain(
      'Side [0]:      Refunds are processed within 5 days. (billing/refunds)',
    )
    expect(stdout).toContain('Side [1]:      Refunds are processed within 10 days. (billing/faq)')
    expect(stdout).toContain('Suggested:     [1]')
  })

  test('prints conflict sides without entry paths or a suggestion', async () => {
    mockIssuesGet.mockResolvedValue({
      ...conflictIssue,
      content: {
        ...conflictIssue.content,
        sides: [{claim: 'Claim A'}, {claim: 'Claim B', entryPaths: []}],
        suggested: undefined,
      },
    })

    const {error, stdout} = await testCommand(GetIssueCommand, ['kb-abc123', 'issue.conflict789'])

    if (error) throw error
    expect(stdout).toContain('Side [0]:      Claim A\n')
    expect(stdout).toContain('Side [1]:      Claim B\n')
    expect(stdout).not.toContain('Suggested:')
  })

  test('prints the chosen side of a resolved conflict', async () => {
    mockIssuesGet.mockResolvedValue({
      ...conflictIssue,
      resolution: 1,
      resolvedAt: '2026-08-02T00:00:00Z',
      resolvedBy: null,
      status: 'accepted',
    })

    const {error, stdout} = await testCommand(GetIssueCommand, ['kb-abc123', 'issue.conflict789'])

    if (error) throw error
    expect(stdout).toContain('Resolution:    [1]')
  })

  test('outputs JSON with --json', async () => {
    mockIssuesGet.mockResolvedValue(issue)

    const {error, stdout} = await testCommand(GetIssueCommand, [
      'kb-abc123',
      'issue.def456',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(issue)
  })

  test('errors when the issue does not exist', async () => {
    mockIssuesGet.mockResolvedValue(null)

    const {error} = await testCommand(GetIssueCommand, ['kb-abc123', 'issue.missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain(
      'Issue "issue.missing" not found on knowledge base "kb-abc123"',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors with a friendly message when the knowledge base does not exist', async () => {
    mockKnowledgeBasesGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(GetIssueCommand, ['kb-missing', 'issue.def456'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockIssuesGet.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(GetIssueCommand, ['kb-abc123', 'issue.def456'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to get issue')
    expect(error?.oclif?.exit).toBe(1)
  })
})

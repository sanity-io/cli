import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {conflictIssue, issue, knowledgeBase} from '../../__tests__/fixtures.js'
import {ListIssuesCommand} from '../list.js'

const mockIssuesList = vi.hoisted(() => vi.fn())
const mockKnowledgeBasesGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context issues list', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {issues: {list: mockIssuesList}, knowledgeBases: {get: mockKnowledgeBasesGet}},
    })
    mockKnowledgeBasesGet.mockResolvedValue(knowledgeBase)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lists issues in a table', async () => {
    mockIssuesList.mockResolvedValue([issue, conflictIssue])

    const {error, stdout} = await testCommand(ListIssuesCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('issue.def456')
    expect(stdout).toContain('update_required')
    expect(stdout).toContain('billing/refunds')
    expect(stdout).toContain('issue.conflict789')
    expect(mockIssuesList).toHaveBeenCalledWith({status: undefined})
  })

  test('reads from the organization store using the knowledge base public ID', async () => {
    mockIssuesList.mockResolvedValue([issue])

    const {error} = await testCommand(ListIssuesCommand, [knowledgeBase.id])

    if (error) throw error
    expect(mockKnowledgeBasesGet).toHaveBeenCalledWith(knowledgeBase.id)
    expect(mockGetGlobalCliClient).toHaveBeenLastCalledWith(
      expect.objectContaining({
        context: {organizationId: 'org-abc123'},
        resource: {id: 'kb-abc123', type: 'knowledge-base'},
      }),
    )
  })

  test('filters by --status', async () => {
    mockIssuesList.mockResolvedValue([issue])

    const {error} = await testCommand(ListIssuesCommand, ['kb-abc123', '--status', 'open'])

    if (error) throw error
    expect(mockIssuesList).toHaveBeenCalledWith({status: 'open'})
  })

  test('outputs JSON with --json', async () => {
    mockIssuesList.mockResolvedValue([issue])

    const {error, stdout} = await testCommand(ListIssuesCommand, ['kb-abc123', '--json'])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual([issue])
  })

  test('prints a message when there are no issues', async () => {
    mockIssuesList.mockResolvedValue([])

    const {error, stdout} = await testCommand(ListIssuesCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('No issues found')
  })

  test('errors with a friendly message when the knowledge base does not exist', async () => {
    mockKnowledgeBasesGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(ListIssuesCommand, ['kb-missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockIssuesList).not.toHaveBeenCalled()
  })

  test('errors when API call fails', async () => {
    mockIssuesList.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(ListIssuesCommand, ['kb-abc123'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to list issues')
    expect(error?.oclif?.exit).toBe(1)
  })
})

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

  test('prints each issue as an ID and metadata line followed by its summary', async () => {
    mockIssuesList.mockResolvedValue([issue, conflictIssue])

    const {error, stdout} = await testCommand(ListIssuesCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toBe(
      [
        'issue.def456  update_required · suggestion · open · billing/refunds',
        '  The refunds entry says 5 days, but the source now says 10 days.',
        '',
        'issue.conflict789  conflict · critical · open · *',
        '  Two entries disagree on the refund window.',
        '',
      ].join('\n'),
    )
    expect(mockIssuesList).toHaveBeenCalledWith({status: undefined})
  })

  test('cuts the summary to one line that fits the terminal', async () => {
    const columns = process.stdout.columns
    process.stdout.columns = 40
    mockIssuesList.mockResolvedValue([
      {...issue, content: {...issue.content, issue: `First line\nsecond line ${'x'.repeat(80)}`}},
    ])

    try {
      const {error, stdout} = await testCommand(ListIssuesCommand, ['kb-abc123'])

      if (error) throw error
      const summary = stdout.split('\n')[1]
      expect(summary).toBe(`  First line second line ${'x'.repeat(14)}…`)
      expect(summary).toHaveLength(40)
    } finally {
      process.stdout.columns = columns
    }
  })

  test('does not split an emoji at the cut point', async () => {
    const columns = process.stdout.columns
    process.stdout.columns = 40
    mockIssuesList.mockResolvedValue([
      {...issue, content: {...issue.content, issue: `${'a'.repeat(36)}🎉 and more text`}},
    ])

    try {
      const {error, stdout} = await testCommand(ListIssuesCommand, ['kb-abc123'])

      if (error) throw error
      expect(stdout.split('\n')[1]).toBe(`  ${'a'.repeat(36)}🎉…`)
    } finally {
      process.stdout.columns = columns
    }
  })

  test('accepts every issue kind the client defines as a --kind value', () => {
    expect(ListIssuesCommand.flags.kind.options).toEqual([
      'add_entry',
      'conflict',
      'gap',
      'remove_entry',
      'update_required',
    ])
  })

  test.each([
    [['--kind', 'conflict'], ['issue.conflict789']],
    [['--severity', 'suggestion'], ['issue.def456']],
    [['--scope', 'billing'], ['issue.def456']],
    [['--scope', 'billing/refunds/'], ['issue.def456']],
    [['--scope', 'bill'], []],
    [['--scope', '*'], ['issue.conflict789']],
    [['--kind', 'conflict', '--severity', 'suggestion'], []],
  ])('filters with %j', async (args, expectedIds) => {
    mockIssuesList.mockResolvedValue([issue, conflictIssue])

    const {error, stdout} = await testCommand(ListIssuesCommand, ['kb-abc123', '--json', ...args])

    if (error) throw error
    expect(JSON.parse(stdout).map((doc: {_id: string}) => doc._id)).toEqual(expectedIds)
  })

  test('rejects an empty --scope', async () => {
    const {error} = await testCommand(ListIssuesCommand, ['kb-abc123', '--scope', ' '])

    expect(error?.message).toContain('`--scope` cannot be empty')
    expect(mockIssuesList).not.toHaveBeenCalled()
  })

  test('reports a failure as JSON with --json', async () => {
    const previousExitCode = process.exitCode
    mockIssuesList.mockRejectedValue(new Error('Server error'))

    try {
      const {stdout} = await testCommand(ListIssuesCommand, ['kb-abc123', '--json'])

      expect(JSON.parse(stdout).error.message).toBe('Failed to list issues: Server error')
      expect(process.exitCode).toBe(1)
    } finally {
      process.exitCode = previousExitCode
    }
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

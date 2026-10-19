import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {issue} from '../../__tests__/fixtures.js'
import {ReopenIssueCommand} from '../reopen.js'

const mockIssuesReopen = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context issues reopen', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {issues: {reopen: mockIssuesReopen}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('reopens an issue', async () => {
    mockIssuesReopen.mockResolvedValue(issue)

    const {error, stdout} = await testCommand(ReopenIssueCommand, ['kb-abc123', 'issue.def456'])

    if (error) throw error
    expect(stdout).toContain('Issue reopened')
    expect(mockIssuesReopen).toHaveBeenCalledWith({issueId: 'issue.def456'})
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test.each([
    ['rejected', 'dismissed'],
    ['accepted', 'accepted'],
  ])('errors when a %s issue comes back unchanged', async (status, label) => {
    mockIssuesReopen.mockResolvedValue({...issue, status})

    const {error, stdout} = await testCommand(ReopenIssueCommand, ['kb-abc123', 'issue.def456'])

    expect(error?.message).toContain(`Issue "issue.def456" is ${label} and cannot be reopened.`)
    expect(error?.message).toContain('Only resolved conflict issues can be reopened.')
    expect(error?.oclif?.exit).toBe(1)
    expect(stdout).not.toContain('Issue reopened')
  })

  test('errors with a friendly message on 404', async () => {
    mockIssuesReopen.mockRejectedValue(httpError(404))

    const {error} = await testCommand(ReopenIssueCommand, ['kb-abc123', 'issue.missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Issue "issue.missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockIssuesReopen.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(ReopenIssueCommand, ['kb-abc123', 'issue.def456'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to reopen issue')
    expect(error?.oclif?.exit).toBe(1)
  })
})

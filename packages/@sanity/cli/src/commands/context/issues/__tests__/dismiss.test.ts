import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {issue} from '../../__tests__/fixtures.js'
import {DismissIssueCommand} from '../dismiss.js'

const mockIssuesDismiss = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context issues dismiss', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {issues: {dismiss: mockIssuesDismiss}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('dismisses an issue', async () => {
    mockIssuesDismiss.mockResolvedValue({...issue, status: 'rejected'})

    const {error, stdout} = await testCommand(DismissIssueCommand, ['kb-abc123', 'issue.def456'])

    if (error) throw error
    expect(stdout).toContain('Issue dismissed')
    expect(mockIssuesDismiss).toHaveBeenCalledWith({issueId: 'issue.def456'})
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('errors when the issue already left triage', async () => {
    mockIssuesDismiss.mockResolvedValue({...issue, status: 'accepted'})

    const {error, stdout} = await testCommand(DismissIssueCommand, ['kb-abc123', 'issue.def456'])

    expect(error?.message).toBe(
      'Issue "issue.def456" is accepted (resolved or applied) and cannot be dismissed',
    )
    expect(error?.oclif?.exit).toBe(1)
    expect(stdout).not.toContain('Issue dismissed')
  })

  test('errors with a friendly message on 404', async () => {
    mockIssuesDismiss.mockRejectedValue(httpError(404))

    const {error} = await testCommand(DismissIssueCommand, ['kb-abc123', 'issue.missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Issue "issue.missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockIssuesDismiss.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(DismissIssueCommand, ['kb-abc123', 'issue.def456'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to dismiss issue')
    expect(error?.oclif?.exit).toBe(1)
  })
})

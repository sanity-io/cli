import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {succeededJob} from '../../__tests__/fixtures.js'
import {RebuildEntryCommand} from '../rebuild.js'

const mockEntriesRebuild = vi.hoisted(() => vi.fn())
const mockJobsGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))

describe('context entries rebuild', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {entries: {rebuild: mockEntriesRebuild}, jobs: {get: mockJobsGet}},
    })
    mockEntriesRebuild.mockResolvedValue({affectedEntries: [], jobId: 'job-def456'})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('starts a rebuild and prints the job ID with a tracking hint', async () => {
    const {error, stdout} = await testCommand(RebuildEntryCommand, ['kb-abc123', 'billing/refunds'])

    if (error) throw error
    expect(mockEntriesRebuild).toHaveBeenCalledWith({path: 'billing/refunds'})
    expect(stdout).toContain('Job ID:              job-def456')
    expect(stdout).not.toContain('Shares sources with')
    expect(stdout).toContain('Track it with: sanity context jobs get kb-abc123 job-def456')
    expect(mockJobsGet).not.toHaveBeenCalled()
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('lists other entries that share sources with the entry', async () => {
    mockEntriesRebuild.mockResolvedValue({
      affectedEntries: [
        {id: 'entry.a', path: 'billing/faq', title: 'Billing FAQ'},
        {id: 'entry.b', path: 'billing/invoices', title: 'Invoices'},
      ],
      jobId: 'job-def456',
    })

    const {error, stdout} = await testCommand(RebuildEntryCommand, ['kb-abc123', 'billing/refunds'])

    if (error) throw error
    expect(stdout).toContain('Job ID:              job-def456')
    expect(stdout).toContain('Shares sources with: billing/faq, billing/invoices')
  })

  test('waits for the rebuild with --watch and succeeds', async () => {
    mockJobsGet.mockResolvedValue(succeededJob)

    const {error} = await testCommand(RebuildEntryCommand, [
      'kb-abc123',
      'billing/refunds',
      '--watch',
    ])

    if (error) throw error
    expect(mockJobsGet).toHaveBeenCalledWith({jobId: 'job-def456'})
  })

  test('exits non-zero when a watched rebuild fails', async () => {
    mockJobsGet.mockResolvedValue({...succeededJob, error: 'boom', status: 'failed'})

    const {error} = await testCommand(RebuildEntryCommand, [
      'kb-abc123',
      'billing/refunds',
      '--watch',
    ])

    expect(error?.message).toBe('Rebuild failed: boom')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when polling a watched rebuild fails', async () => {
    mockJobsGet.mockRejectedValue(new Error('Network down'))

    const {error} = await testCommand(RebuildEntryCommand, [
      'kb-abc123',
      'billing/refunds',
      '--watch',
    ])

    expect(error?.message).toContain('Failed to watch rebuild job')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors with a friendly message on 404', async () => {
    mockEntriesRebuild.mockRejectedValue(httpError(404))

    const {error} = await testCommand(RebuildEntryCommand, ['kb-abc123', 'billing/missing'])

    expect(error?.message).toContain(
      'Entry "billing/missing" not found on knowledge base "kb-abc123"',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockEntriesRebuild.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(RebuildEntryCommand, ['kb-abc123', 'billing/refunds'])

    expect(error?.message).toContain('Failed to start rebuild')
    expect(error?.oclif?.exit).toBe(1)
  })
})

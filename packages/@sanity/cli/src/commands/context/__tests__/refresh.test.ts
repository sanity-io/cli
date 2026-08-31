import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../test/helpers/httpError.js'
import {RefreshKnowledgeBaseCommand} from '../refresh.js'

const mockRefresh = vi.hoisted(() => vi.fn())
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
    }),
  }
})

describe('context refresh', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {refresh: mockRefresh}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('starts a refresh and prints the job ID with a progress hint', async () => {
    mockRefresh.mockResolvedValue({jobId: 'job-def456', started: true})

    const {error, stdout} = await testCommand(RefreshKnowledgeBaseCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('Job ID: job-def456')
    expect(stdout).toContain('Check progress with: sanity context get kb-abc123')
    expect(stdout).not.toContain('jobs get')
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('errors with a friendly message on 404', async () => {
    mockRefresh.mockRejectedValue(httpError(404))

    const {error} = await testCommand(RefreshKnowledgeBaseCommand, ['kb-missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockRefresh.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(RefreshKnowledgeBaseCommand, ['kb-abc123'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to refresh knowledge base')
    expect(error?.oclif?.exit).toBe(1)
  })
})

import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../test/helpers/httpError.js'
import {SyncKnowledgeBaseCommand} from '../sync.js'

const mockSync = vi.hoisted(() => vi.fn())
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

describe('context sync', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {sync: mockSync}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('queues a sync of every website and dataset source', async () => {
    mockSync.mockResolvedValue({sourceIds: ['source-def456', 'source-dataset']})

    const {error, stdout} = await testCommand(SyncKnowledgeBaseCommand, ['kb-abc123'])

    if (error) throw error
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
    expect(stdout).toContain('Queued a sync of 2 sources:')
    expect(stdout).toContain('  source-dataset')
    expect(stdout).toContain('sanity context sources list kb-abc123')
  })

  test('uses the singular for one source', async () => {
    mockSync.mockResolvedValue({sourceIds: ['source-def456']})

    const {error, stdout} = await testCommand(SyncKnowledgeBaseCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('Queued a sync of 1 source:')
  })

  test('says when there is nothing to sync', async () => {
    mockSync.mockResolvedValue({sourceIds: []})

    const {error, stdout} = await testCommand(SyncKnowledgeBaseCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('No website or dataset sources to sync')
  })

  test('outputs JSON with --json', async () => {
    mockSync.mockResolvedValue({sourceIds: ['source-def456']})

    const {error, stdout} = await testCommand(SyncKnowledgeBaseCommand, ['kb-abc123', '--json'])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual({sourceIds: ['source-def456']})
  })

  test('errors with a friendly message on 404', async () => {
    mockSync.mockRejectedValue(httpError(404))

    const {error} = await testCommand(SyncKnowledgeBaseCommand, ['kb-missing'])

    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockSync.mockRejectedValue(httpError(403, 'Syncs are not in your plan'))

    const {error} = await testCommand(SyncKnowledgeBaseCommand, ['kb-abc123'])

    expect(error?.message).toContain('Failed to sync knowledge base: Syncs are not in your plan')
    expect(error?.oclif?.exit).toBe(1)
  })
})

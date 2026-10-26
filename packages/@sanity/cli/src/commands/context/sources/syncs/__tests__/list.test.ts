import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../../test/helpers/httpError.js'
import {heldSync, latestSync} from '../../../__tests__/fixtures.js'
import {ListSyncsCommand} from '../list.js'

const mockSyncsList = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context sources syncs list', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {sources: {syncs: {list: mockSyncsList}}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lists every page of syncs in a table', async () => {
    mockSyncsList
      .mockResolvedValueOnce({data: [heldSync], nextCursor: 'cursor-2'})
      .mockResolvedValueOnce({data: [latestSync], nextCursor: null})

    const {error, stdout} = await testCommand(ListSyncsCommand, ['kb-abc123', 'source-def456'])

    if (error) throw error
    expect(mockSyncsList).toHaveBeenNthCalledWith(1, {cursor: undefined, sourceId: 'source-def456'})
    expect(mockSyncsList).toHaveBeenNthCalledWith(2, {
      cursor: 'cursor-2',
      sourceId: 'source-def456',
    })
    expect(stdout).toContain('sync-held')
    expect(stdout).toContain('held')
    expect(stdout).toContain('sync-ghi789')
  })

  test('outputs JSON with --json', async () => {
    mockSyncsList.mockResolvedValue({data: [latestSync], nextCursor: null})

    const {error, stdout} = await testCommand(ListSyncsCommand, [
      'kb-abc123',
      'source-def456',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual([latestSync])
  })

  test('says when there are no syncs', async () => {
    mockSyncsList.mockResolvedValue({data: [], nextCursor: null})

    const {error, stdout} = await testCommand(ListSyncsCommand, ['kb-abc123', 'source-def456'])

    if (error) throw error
    expect(stdout).toContain('No syncs found')
  })

  test('errors with a friendly message on 404', async () => {
    mockSyncsList.mockRejectedValue(httpError(404))

    const {error} = await testCommand(ListSyncsCommand, ['kb-abc123', 'source-missing'])

    expect(error?.message).toContain('Source "source-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockSyncsList.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(ListSyncsCommand, ['kb-abc123', 'source-def456'])

    expect(error?.message).toContain('Failed to list syncs: Server error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

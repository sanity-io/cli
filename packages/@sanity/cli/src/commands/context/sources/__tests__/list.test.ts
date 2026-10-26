import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {datasetSource, filesSource, webSource} from '../../__tests__/fixtures.js'
import {ListSourcesCommand} from '../list.js'

const mockSourcesList = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context sources list', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {sources: {list: mockSourcesList}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lists every page of sources in a table', async () => {
    mockSourcesList
      .mockResolvedValueOnce({data: [webSource, datasetSource], nextCursor: 'cursor-2'})
      .mockResolvedValueOnce({
        data: [{...filesSource, lastSyncedAt: null, latestSync: null}],
        nextCursor: null,
      })

    const {error, stdout} = await testCommand(ListSourcesCommand, ['kb-abc123'])

    if (error) throw error
    expect(mockSourcesList).toHaveBeenNthCalledWith(1, {cursor: undefined})
    expect(mockSourcesList).toHaveBeenNthCalledWith(2, {cursor: 'cursor-2'})
    expect(stdout).toContain('source-def456')
    expect(stdout).toContain('sanity-dataset')
    expect(stdout).toContain('source-files')
    expect(stdout).toContain('completed')
    expect(stdout).not.toContain('\u001B[')
  })

  test('outputs JSON with --json', async () => {
    mockSourcesList.mockResolvedValue({data: [webSource], nextCursor: null})

    const {error, stdout} = await testCommand(ListSourcesCommand, ['kb-abc123', '--json'])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual([webSource])
  })

  test('says when there are no sources', async () => {
    mockSourcesList.mockResolvedValue({data: [], nextCursor: null})

    const {error, stdout} = await testCommand(ListSourcesCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('No sources found')
  })

  test('errors with a friendly message on 404', async () => {
    mockSourcesList.mockRejectedValue(httpError(404))

    const {error} = await testCommand(ListSourcesCommand, ['kb-missing'])

    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockSourcesList.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(ListSourcesCommand, ['kb-abc123'])

    expect(error?.message).toContain('Failed to list sources: Server error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

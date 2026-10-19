import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {source} from '../../__tests__/fixtures.js'
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

  test('lists sources in a table', async () => {
    mockSourcesList.mockResolvedValue({data: [source], nextCursor: null})

    const {error, stdout} = await testCommand(ListSourcesCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('source-def456')
    expect(stdout).toContain('refunds.md')
    expect(stdout).toContain('ready')
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('passes --status and --import filters to every page', async () => {
    mockSourcesList
      .mockResolvedValueOnce({data: [source], nextCursor: 'cursor-1'})
      .mockResolvedValueOnce({data: [{...source, id: 'source-second'}], nextCursor: null})

    const {error, stdout} = await testCommand(ListSourcesCommand, [
      'kb-abc123',
      '--status',
      'ready',
      '--import',
      'import-def456',
    ])

    if (error) throw error
    expect(stdout).toContain('source-def456')
    expect(stdout).toContain('source-second')
    expect(mockSourcesList).toHaveBeenCalledTimes(2)
    expect(mockSourcesList).toHaveBeenNthCalledWith(1, {
      cursor: undefined,
      importId: 'import-def456',
      status: 'ready',
    })
    expect(mockSourcesList).toHaveBeenNthCalledWith(2, {
      cursor: 'cursor-1',
      importId: 'import-def456',
      status: 'ready',
    })
  })

  test('rejects an empty --import', async () => {
    const {error} = await testCommand(ListSourcesCommand, ['kb-abc123', '--import', ' '])

    expect(error?.message).toContain('`--import` cannot be empty')
    expect(mockSourcesList).not.toHaveBeenCalled()
  })

  test('outputs JSON with --json', async () => {
    mockSourcesList.mockResolvedValue({data: [source], nextCursor: null})

    const {error, stdout} = await testCommand(ListSourcesCommand, ['kb-abc123', '--json'])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual([source])
  })

  test('prints a message when there are no sources', async () => {
    mockSourcesList.mockResolvedValue({data: [], nextCursor: null})

    const {error, stdout} = await testCommand(ListSourcesCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('No sources found')
  })

  test('errors with a friendly message on 404', async () => {
    mockSourcesList.mockRejectedValue(httpError(404))

    const {error} = await testCommand(ListSourcesCommand, ['kb-missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockSourcesList.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(ListSourcesCommand, ['kb-abc123'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to list sources')
    expect(error?.oclif?.exit).toBe(1)
  })
})

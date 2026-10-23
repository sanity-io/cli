import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {entry, knowledgeBase} from '../../__tests__/fixtures.js'
import {ListEntriesCommand} from '../list.js'

const mockEntriesList = vi.hoisted(() => vi.fn())
const mockKnowledgeBasesGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

const listedEntry = {
  _id: entry._id,
  path: entry.path,
  status: entry.status,
  title: entry.title,
  tldr: entry.tldr,
}

describe('context entries list', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {entries: {list: mockEntriesList}, knowledgeBases: {get: mockKnowledgeBasesGet}},
    })
    mockKnowledgeBasesGet.mockResolvedValue(knowledgeBase)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lists entries in a table', async () => {
    mockEntriesList.mockResolvedValue([listedEntry])

    const {error, stdout} = await testCommand(ListEntriesCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('billing/refunds')
    expect(stdout).toContain('Refunds')
    expect(stdout).toContain('filled')
    expect(mockGetGlobalCliClient).toHaveBeenLastCalledWith(
      expect.objectContaining({
        context: {organizationId: 'org-abc123'},
        resource: {id: 'kb-abc123', type: 'knowledge-base'},
      }),
    )
  })

  test('outputs JSON with --json', async () => {
    mockEntriesList.mockResolvedValue([listedEntry])

    const {error, stdout} = await testCommand(ListEntriesCommand, ['kb-abc123', '--json'])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual([listedEntry])
  })

  test('prints a message when there are no entries', async () => {
    mockEntriesList.mockResolvedValue([])

    const {error, stdout} = await testCommand(ListEntriesCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('No entries found')
  })

  test('errors with a friendly message when the knowledge base does not exist', async () => {
    mockKnowledgeBasesGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(ListEntriesCommand, ['kb-missing'])

    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockEntriesList.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(ListEntriesCommand, ['kb-abc123'])

    expect(error?.message).toContain('Failed to list entries')
    expect(error?.oclif?.exit).toBe(1)
  })
})

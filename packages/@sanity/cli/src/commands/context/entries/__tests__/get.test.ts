import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {entry, knowledgeBase} from '../../__tests__/fixtures.js'
import {GetEntryCommand} from '../get.js'

const mockEntriesGet = vi.hoisted(() => vi.fn())
const mockKnowledgeBasesGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context entries get', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {entries: {get: mockEntriesGet}, knowledgeBases: {get: mockKnowledgeBasesGet}},
    })
    mockKnowledgeBasesGet.mockResolvedValue(knowledgeBase)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints entry details followed by the body', async () => {
    mockEntriesGet.mockResolvedValue(entry)

    const {error, stdout} = await testCommand(GetEntryCommand, ['kb-abc123', 'billing/refunds'])

    if (error) throw error
    expect(stdout).toContain('Path:      billing/refunds')
    expect(stdout).toContain('Title:     Refunds')
    expect(stdout).toContain('Status:    filled')
    expect(stdout).toContain('Scope:     How and when refunds are processed')
    expect(stdout).toContain('Citations: 1')
    expect(stdout).toContain('Generated: 2026-08-01T01:00:00Z')
    expect(stdout).toContain('\n\n# Refunds\nRefunds are processed within 10 days.\n')
    expect(mockEntriesGet).toHaveBeenCalledWith({path: 'billing/refunds'})
  })

  test('prints placeholders for an entry without summary, citations or body', async () => {
    mockEntriesGet.mockResolvedValue({
      ...entry,
      body: undefined,
      citations: undefined,
      status: 'outlined',
      tldr: undefined,
    })

    const {error, stdout} = await testCommand(GetEntryCommand, ['kb-abc123', 'billing/refunds'])

    if (error) throw error
    expect(stdout).toContain('Scope:     -')
    expect(stdout).toContain('Citations: 0')
    expect(stdout).not.toContain('# Refunds')
  })

  test('outputs JSON with --json', async () => {
    mockEntriesGet.mockResolvedValue(entry)

    const {error, stdout} = await testCommand(GetEntryCommand, [
      'kb-abc123',
      'billing/refunds',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(entry)
  })

  test('errors when no entry exists at the path', async () => {
    mockEntriesGet.mockResolvedValue(null)

    const {error} = await testCommand(GetEntryCommand, ['kb-abc123', 'billing/missing'])

    expect(error?.message).toContain(
      'Entry "billing/missing" not found on knowledge base "kb-abc123"',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors with a friendly message when the knowledge base does not exist', async () => {
    mockKnowledgeBasesGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(GetEntryCommand, ['kb-missing', 'billing/refunds'])

    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockEntriesGet.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(GetEntryCommand, ['kb-abc123', 'billing/refunds'])

    expect(error?.message).toContain('Failed to get entry')
    expect(error?.oclif?.exit).toBe(1)
  })
})

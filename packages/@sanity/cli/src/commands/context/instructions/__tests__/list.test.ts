import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {instruction, knowledgeBase} from '../../__tests__/fixtures.js'
import {ListInstructionsCommand} from '../list.js'

const mockInstructionsList = vi.hoisted(() => vi.fn())
const mockKnowledgeBasesGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context instructions list', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {
        instructions: {list: mockInstructionsList},
        knowledgeBases: {get: mockKnowledgeBasesGet},
      },
    })
    mockKnowledgeBasesGet.mockResolvedValue(knowledgeBase)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lists instructions in a table', async () => {
    mockInstructionsList.mockResolvedValue([instruction])

    const {error, stdout} = await testCommand(ListInstructionsCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('instruction.def456')
    expect(stdout).toContain('human')
    expect(stdout).toContain('active')
    expect(stdout).toContain('Treat the pricing page')
    expect(mockGetGlobalCliClient).toHaveBeenLastCalledWith(
      expect.objectContaining({
        context: {organizationId: 'org-abc123'},
        resource: {id: 'kb-abc123', type: 'knowledge-base'},
      }),
    )
  })

  test('outputs JSON with --json', async () => {
    mockInstructionsList.mockResolvedValue([instruction])

    const {error, stdout} = await testCommand(ListInstructionsCommand, ['kb-abc123', '--json'])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual([instruction])
  })

  test('prints a message when there are no instructions', async () => {
    mockInstructionsList.mockResolvedValue([])

    const {error, stdout} = await testCommand(ListInstructionsCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('No instructions found')
  })

  test('errors with a friendly message when the knowledge base does not exist', async () => {
    mockKnowledgeBasesGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(ListInstructionsCommand, ['kb-missing'])

    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockInstructionsList.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(ListInstructionsCommand, ['kb-abc123'])

    expect(error?.message).toContain('Failed to list instructions')
    expect(error?.oclif?.exit).toBe(1)
  })
})

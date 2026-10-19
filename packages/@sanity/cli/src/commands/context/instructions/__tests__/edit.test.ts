import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {parseArguments} from '../../../../util/parseArguments.js'
import {EditInstructionCommand} from '../edit.js'

const mockInstructionsEdit = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context instructions edit', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {instructions: {edit: mockInstructionsEdit}},
    })
    mockInstructionsEdit.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('edits the statement only', async () => {
    const {error, stdout} = await testCommand(EditInstructionCommand, [
      'kb-abc123',
      'instruction.def456',
      '--statement',
      '  New statement  ',
    ])

    if (error) throw error
    expect(mockInstructionsEdit).toHaveBeenCalledWith({
      instructionId: 'instruction.def456',
      statement: 'New statement',
    })
    expect(stdout).toContain('Instruction updated')
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('replaces the sources only', async () => {
    const {error} = await testCommand(EditInstructionCommand, [
      'kb-abc123',
      'instruction.def456',
      '--scope-source',
      'source-a',
      '--scope-source',
      'source-b',
    ])

    if (error) throw error
    expect(mockInstructionsEdit).toHaveBeenCalledWith({
      instructionId: 'instruction.def456',
      scopeSourceIds: ['source-a', 'source-b'],
    })
  })

  test('requires --statement or --scope-source', async () => {
    const {error} = await testCommand(EditInstructionCommand, ['kb-abc123', 'instruction.def456'])

    expect(error?.message).toContain('--statement')
    expect(error?.message).toContain('--scope-source')
    expect(mockInstructionsEdit).not.toHaveBeenCalled()
  })

  test('rejects an empty --statement', async () => {
    const {error} = await testCommand(EditInstructionCommand, [
      'kb-abc123',
      'instruction.def456',
      '--statement',
      ' ',
    ])

    expect(error?.message).toContain('`--statement` cannot be empty')
    expect(mockInstructionsEdit).not.toHaveBeenCalled()
  })

  test('rejects an empty --scope-source', async () => {
    const {error} = await testCommand(EditInstructionCommand, [
      'kb-abc123',
      'instruction.def456',
      '--scope-source',
      ' ',
    ])

    expect(error?.message).toContain('`--scope-source` cannot be empty')
    expect(mockInstructionsEdit).not.toHaveBeenCalled()
  })

  test('errors with a friendly message on 404', async () => {
    mockInstructionsEdit.mockRejectedValue(httpError(404))

    const {error} = await testCommand(EditInstructionCommand, [
      'kb-abc123',
      'instruction.missing',
      '--statement',
      'New statement',
    ])

    expect(error?.message).toContain('Instruction "instruction.missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockInstructionsEdit.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(EditInstructionCommand, [
      'kb-abc123',
      'instruction.def456',
      '--statement',
      'New statement',
    ])

    expect(error?.message).toContain('Failed to edit instruction')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('redacts the statement from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'instructions',
        'edit',
        'kb-abc123',
        'instruction.def456',
        '--statement=Secret policy',
      ],
      EditInstructionCommand.telemetry,
    )

    expect(result.extraArguments).toEqual(['--statement'])
  })
})

import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {parseArguments} from '../../../../util/parseArguments.js'
import {CreateInstructionCommand} from '../create.js'

const mockInstructionsCreate = vi.hoisted(() => vi.fn())
const mockInput = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {...actual, input: mockInput}
})

describe('context instructions create', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {instructions: {create: mockInstructionsCreate}},
    })
    mockInstructionsCreate.mockResolvedValue({
      instruction: {id: 'instruction.def456'},
      rebuildJobId: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('creates an instruction with flags', async () => {
    const {error, stdout} = await testCommand(CreateInstructionCommand, [
      'kb-abc123',
      '--statement',
      '  Prefer the pricing page  ',
      '--scope-source',
      ' source-a ',
      '--scope-source',
      'source-b',
    ])

    if (error) throw error
    expect(mockInstructionsCreate).toHaveBeenCalledWith({
      scopeSourceIds: ['source-a', 'source-b'],
      statement: 'Prefer the pricing page',
    })
    expect(mockInput).not.toHaveBeenCalled()
    expect(stdout).toContain('Instruction created')
    expect(stdout).toContain('ID: instruction.def456')
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('prompts for the statement when interactive', async () => {
    mockInput.mockResolvedValue('  Prefer the pricing page  ')

    const {error} = await testCommand(
      CreateInstructionCommand,
      ['kb-abc123', '--scope-source', 'source-a'],
      {mocks: {isInteractive: true}},
    )

    if (error) throw error
    expect(mockInput).toHaveBeenCalledWith(
      expect.objectContaining({message: 'Instruction statement:'}),
    )
    const {validate} = mockInput.mock.calls[0][0]
    expect(validate('  ')).toBe('Value cannot be empty')
    expect(validate('ok')).toBe(true)
    expect(mockInstructionsCreate).toHaveBeenCalledWith({
      scopeSourceIds: ['source-a'],
      statement: 'Prefer the pricing page',
    })
  })

  test('errors when --statement is missing in a non-interactive environment', async () => {
    const {error} = await testCommand(
      CreateInstructionCommand,
      ['kb-abc123', '--scope-source', 'source-a'],
      {mocks: {isInteractive: false}},
    )

    expect(error?.message).toContain('Missing required flag statement')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockInput).not.toHaveBeenCalled()
  })

  test('errors when --statement is whitespace-only instead of prompting', async () => {
    const {error} = await testCommand(
      CreateInstructionCommand,
      ['kb-abc123', '--statement', '  ', '--scope-source', 'source-a'],
      {mocks: {isInteractive: true}},
    )

    expect(error?.message).toContain('Statement cannot be empty')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockInput).not.toHaveBeenCalled()
  })

  test('requires at least one --scope-source', async () => {
    const {error} = await testCommand(CreateInstructionCommand, [
      'kb-abc123',
      '--statement',
      'Prefer the pricing page',
    ])

    expect(error?.message).toContain('Missing required flag scope-source')
    expect(mockInstructionsCreate).not.toHaveBeenCalled()
  })

  test('rejects an empty --scope-source', async () => {
    const {error} = await testCommand(CreateInstructionCommand, [
      'kb-abc123',
      '--statement',
      'Prefer the pricing page',
      '--scope-source',
      ' ',
    ])

    expect(error?.message).toContain('`--scope-source` cannot be empty')
    expect(mockInstructionsCreate).not.toHaveBeenCalled()
  })

  test('errors with a friendly message on 404', async () => {
    mockInstructionsCreate.mockRejectedValue(httpError(404))

    const {error} = await testCommand(CreateInstructionCommand, [
      'kb-missing',
      '--statement',
      'Prefer the pricing page',
      '--scope-source',
      'source-a',
    ])

    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockInstructionsCreate.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(CreateInstructionCommand, [
      'kb-abc123',
      '--statement',
      'Prefer the pricing page',
      '--scope-source',
      'source-a',
    ])

    expect(error?.message).toContain('Failed to create instruction')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('redacts the statement from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'instructions',
        'create',
        'kb-abc123',
        '--statement=Secret policy',
        '--scope-source=source-a',
      ],
      CreateInstructionCommand.telemetry,
    )

    expect(result.extraArguments).toEqual(['--statement', '--scope-source=source-a'])
  })
})

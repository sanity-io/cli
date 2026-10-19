import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {DeleteInstructionCommand} from '../delete.js'

const mockInstructionsDelete = vi.hoisted(() => vi.fn())
const mockConfirm = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {...actual, confirm: mockConfirm}
})

describe('context instructions delete', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {instructions: {delete: mockInstructionsDelete}},
    })
    mockInstructionsDelete.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('deletes after confirmation', async () => {
    mockConfirm.mockResolvedValue(true)

    const {error, stdout} = await testCommand(
      DeleteInstructionCommand,
      ['kb-abc123', 'instruction.def456'],
      {
        mocks: {isInteractive: true},
      },
    )

    if (error) throw error
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        default: false,
        message: expect.stringContaining('instruction.def456'),
      }),
    )
    expect(mockInstructionsDelete).toHaveBeenCalledWith({instructionId: 'instruction.def456'})
    expect(stdout).toContain('Instruction deleted')
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('aborts with exit code 3 when confirmation is declined', async () => {
    mockConfirm.mockResolvedValue(false)

    const {error, stdout} = await testCommand(
      DeleteInstructionCommand,
      ['kb-abc123', 'instruction.def456'],
      {
        mocks: {isInteractive: true},
      },
    )

    expect(error?.oclif?.exit).toBe(3)
    expect(stdout).toContain('Instruction not deleted')
    expect(mockInstructionsDelete).not.toHaveBeenCalled()
  })

  test('skips confirmation with --yes', async () => {
    const {error} = await testCommand(DeleteInstructionCommand, [
      'kb-abc123',
      'instruction.def456',
      '--yes',
    ])

    if (error) throw error
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockInstructionsDelete).toHaveBeenCalledWith({instructionId: 'instruction.def456'})
  })

  test('errors without --yes in a non-interactive environment', async () => {
    const {error} = await testCommand(
      DeleteInstructionCommand,
      ['kb-abc123', 'instruction.def456'],
      {
        mocks: {isInteractive: false},
      },
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('--yes')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockInstructionsDelete).not.toHaveBeenCalled()
  })

  test('errors with a friendly message on 404', async () => {
    mockInstructionsDelete.mockRejectedValue(httpError(404))

    const {error} = await testCommand(DeleteInstructionCommand, [
      'kb-abc123',
      'instruction.missing',
      '--yes',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Instruction "instruction.missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockInstructionsDelete.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(DeleteInstructionCommand, [
      'kb-abc123',
      'instruction.def456',
      '--yes',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete instruction')
    expect(error?.oclif?.exit).toBe(1)
  })
})

import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../test/helpers/httpError.js'
import {DeleteKnowledgeBaseCommand} from '../delete.js'

const mockDelete = vi.hoisted(() => vi.fn())
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

describe('context delete', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {knowledgeBases: {delete: mockDelete}}})
    mockDelete.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('deletes after confirmation', async () => {
    mockConfirm.mockResolvedValue(true)

    const {error, stdout} = await testCommand(DeleteKnowledgeBaseCommand, ['kb-abc123'], {
      mocks: {isInteractive: true},
    })

    if (error) throw error
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({default: false, message: expect.stringContaining('kb-abc123')}),
    )
    expect(mockDelete).toHaveBeenCalledWith('kb-abc123')
    expect(stdout).toContain('Knowledge base deleted')
  })

  test('aborts with exit code 3 when confirmation is declined', async () => {
    mockConfirm.mockResolvedValue(false)

    const {error, stdout} = await testCommand(DeleteKnowledgeBaseCommand, ['kb-abc123'], {
      mocks: {isInteractive: true},
    })

    expect(error?.oclif?.exit).toBe(3)
    expect(stdout).toContain('Knowledge base not deleted')
    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('skips confirmation with --yes', async () => {
    const {error} = await testCommand(DeleteKnowledgeBaseCommand, ['kb-abc123', '--yes'])

    if (error) throw error
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockDelete).toHaveBeenCalledWith('kb-abc123')
  })

  test('errors without --yes in a non-interactive environment', async () => {
    const {error} = await testCommand(DeleteKnowledgeBaseCommand, ['kb-abc123'], {
      mocks: {isInteractive: false},
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('--yes')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('errors with a friendly message on 404', async () => {
    mockDelete.mockRejectedValue(httpError(404))

    const {error} = await testCommand(DeleteKnowledgeBaseCommand, ['kb-missing', '--yes'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockDelete.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(DeleteKnowledgeBaseCommand, ['kb-abc123', '--yes'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete knowledge base')
    expect(error?.oclif?.exit).toBe(1)
  })
})

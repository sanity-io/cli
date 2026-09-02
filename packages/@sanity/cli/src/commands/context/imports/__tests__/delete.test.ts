import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {DeleteImportCommand} from '../delete.js'

const mockImportsDelete = vi.hoisted(() => vi.fn())
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

describe('context imports delete', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {imports: {delete: mockImportsDelete}}})
    mockImportsDelete.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('deletes after confirmation', async () => {
    mockConfirm.mockResolvedValue(true)

    const {error, stdout} = await testCommand(DeleteImportCommand, ['kb-abc123', 'import-def456'], {
      mocks: {isInteractive: true},
    })

    if (error) throw error
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({default: false, message: expect.stringContaining('import-def456')}),
    )
    expect(mockImportsDelete).toHaveBeenCalledWith({importId: 'import-def456'})
    expect(stdout).toContain('Import deleted')
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('aborts with exit code 3 when confirmation is declined', async () => {
    mockConfirm.mockResolvedValue(false)

    const {error, stdout} = await testCommand(DeleteImportCommand, ['kb-abc123', 'import-def456'], {
      mocks: {isInteractive: true},
    })

    expect(error?.oclif?.exit).toBe(3)
    expect(stdout).toContain('Import not deleted')
    expect(mockImportsDelete).not.toHaveBeenCalled()
  })

  test('skips confirmation with --yes', async () => {
    const {error} = await testCommand(DeleteImportCommand, ['kb-abc123', 'import-def456', '--yes'])

    if (error) throw error
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockImportsDelete).toHaveBeenCalledWith({importId: 'import-def456'})
  })

  test('errors without --yes in a non-interactive environment', async () => {
    const {error} = await testCommand(DeleteImportCommand, ['kb-abc123', 'import-def456'], {
      mocks: {isInteractive: false},
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('--yes')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockImportsDelete).not.toHaveBeenCalled()
  })

  test('errors with a friendly message on 404', async () => {
    mockImportsDelete.mockRejectedValue(httpError(404))

    const {error} = await testCommand(DeleteImportCommand, ['kb-abc123', 'import-missing', '--yes'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Import "import-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockImportsDelete.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(DeleteImportCommand, ['kb-abc123', 'import-def456', '--yes'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete import')
    expect(error?.oclif?.exit).toBe(1)
  })
})

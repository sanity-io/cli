import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {importItem} from '../../__tests__/fixtures.js'
import {GetImportCommand} from '../get.js'

const mockImportsGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context imports get', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {imports: {get: mockImportsGet}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints import details', async () => {
    mockImportsGet.mockResolvedValue(importItem)

    const {error, stdout} = await testCommand(GetImportCommand, ['kb-abc123', 'import-def456'])

    if (error) throw error
    expect(stdout).toContain('import-def456')
    expect(stdout).toContain('handbook.pdf')
    expect(stdout).toContain('complete')
    expect(stdout).toContain('3/4')
    expect(mockImportsGet).toHaveBeenCalledWith({importId: 'import-def456'})
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('outputs JSON with --json', async () => {
    mockImportsGet.mockResolvedValue(importItem)

    const {error, stdout} = await testCommand(GetImportCommand, [
      'kb-abc123',
      'import-def456',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(importItem)
  })

  test('errors with a friendly message on 404', async () => {
    mockImportsGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(GetImportCommand, ['kb-abc123', 'import-missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Import "import-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockImportsGet.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(GetImportCommand, ['kb-abc123', 'import-def456'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to get import')
    expect(error?.oclif?.exit).toBe(1)
  })
})

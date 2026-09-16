import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {importItem} from '../../__tests__/fixtures.js'
import {ListImportsCommand} from '../list.js'

const mockImportsList = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context imports list', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {imports: {list: mockImportsList}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lists imports in a table', async () => {
    mockImportsList.mockResolvedValue({data: [importItem], nextCursor: null})

    const {error, stdout} = await testCommand(ListImportsCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('import-def456')
    expect(stdout).toContain('handbook.pdf')
    expect(stdout).toContain('complete')
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({resource: {id: 'kb-abc123', type: 'knowledge-base'}}),
    )
  })

  test('drains pagination before printing', async () => {
    mockImportsList
      .mockResolvedValueOnce({data: [importItem], nextCursor: 'cursor-1'})
      .mockResolvedValueOnce({data: [{...importItem, id: 'import-second'}], nextCursor: null})

    const {error, stdout} = await testCommand(ListImportsCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('import-def456')
    expect(stdout).toContain('import-second')
    expect(mockImportsList).toHaveBeenCalledTimes(2)
    expect(mockImportsList).toHaveBeenLastCalledWith({cursor: 'cursor-1'})
  })

  test('outputs JSON with --json', async () => {
    mockImportsList.mockResolvedValue({data: [importItem], nextCursor: null})

    const {error, stdout} = await testCommand(ListImportsCommand, ['kb-abc123', '--json'])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual([importItem])
  })

  test('prints empty state when there are no imports', async () => {
    mockImportsList.mockResolvedValue({data: [], nextCursor: null})

    const {error, stdout} = await testCommand(ListImportsCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('No imports found')
  })

  test('errors with a friendly message on 404', async () => {
    mockImportsList.mockRejectedValue(httpError(404))

    const {error} = await testCommand(ListImportsCommand, ['kb-missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockImportsList.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(ListImportsCommand, ['kb-abc123'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to list imports')
    expect(error?.oclif?.exit).toBe(1)
  })
})

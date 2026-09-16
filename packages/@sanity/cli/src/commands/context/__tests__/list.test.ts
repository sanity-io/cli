import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ListKnowledgeBasesCommand} from '../list.js'
import {knowledgeBase} from './fixtures.js'

const mockList = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {...actual, select: mockSelect}
})

describe('context list', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {knowledgeBases: {list: mockList}},
      request: mockRequest,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('lists knowledge bases in a table', async () => {
    mockList.mockResolvedValue({data: [knowledgeBase], nextCursor: null})

    const {error, stdout} = await testCommand(ListKnowledgeBasesCommand, [
      '--organization',
      'org-abc123',
    ])

    if (error) throw error
    expect(stdout).toContain('kb-abc123')
    expect(stdout).toContain('Support docs')
    expect(stdout).toContain('ready')
    expect(mockList).toHaveBeenCalledWith({cursor: undefined, organizationId: 'org-abc123'})
  })

  test('drains pagination before printing', async () => {
    mockList
      .mockResolvedValueOnce({data: [knowledgeBase], nextCursor: 'cursor-1'})
      .mockResolvedValueOnce({
        data: [{...knowledgeBase, publicId: 'kb-second', title: 'Second KB'}],
        nextCursor: null,
      })

    const {error, stdout} = await testCommand(ListKnowledgeBasesCommand, [
      '--organization',
      'org-abc123',
    ])

    if (error) throw error
    expect(stdout).toContain('kb-abc123')
    expect(stdout).toContain('kb-second')
    expect(mockList).toHaveBeenCalledTimes(2)
    expect(mockList).toHaveBeenLastCalledWith({cursor: 'cursor-1', organizationId: 'org-abc123'})
  })

  test('outputs JSON with --json', async () => {
    mockList.mockResolvedValue({data: [knowledgeBase], nextCursor: null})

    const {error, stdout} = await testCommand(ListKnowledgeBasesCommand, [
      '--organization',
      'org-abc123',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual([knowledgeBase])
  })

  test('prints empty state when there are no knowledge bases', async () => {
    mockList.mockResolvedValue({data: [], nextCursor: null})

    const {error, stdout} = await testCommand(ListKnowledgeBasesCommand, [
      '--organization',
      'org-abc123',
    ])

    if (error) throw error
    expect(stdout).toContain('No knowledge bases found')
  })

  test('falls back to the CLI config organization', async () => {
    mockList.mockResolvedValue({data: [], nextCursor: null})

    const {error} = await testCommand(ListKnowledgeBasesCommand, [], {
      mocks: {cliConfig: {app: {organizationId: 'org-from-config'}}},
    })

    if (error) throw error
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({organizationId: 'org-from-config'}),
    )
  })

  test('prompts for organization when interactive', async () => {
    mockRequest.mockResolvedValue([{id: 'org-abc123', name: 'Acme', slug: null}])
    mockSelect.mockResolvedValue('org-abc123')
    mockList.mockResolvedValue({data: [], nextCursor: null})

    const {error} = await testCommand(ListKnowledgeBasesCommand, [], {
      mocks: {isInteractive: true},
    })

    if (error) throw error
    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({message: 'Select organization:'}),
    )
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({organizationId: 'org-abc123'}))
  })

  test('errors when organization is missing in a non-interactive environment', async () => {
    const {error} = await testCommand(ListKnowledgeBasesCommand, [], {
      mocks: {isInteractive: false},
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization ID is required')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockList).not.toHaveBeenCalled()
  })

  test('errors when API call fails', async () => {
    mockList.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(ListKnowledgeBasesCommand, ['--organization', 'org-abc123'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to list knowledge bases')
    expect(error?.oclif?.exit).toBe(1)
  })
})

import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../test/helpers/httpError.js'
import {GetKnowledgeBaseCommand} from '../get.js'
import {knowledgeBase} from './fixtures.js'

const mockGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context get', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {knowledgeBases: {get: mockGet}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints knowledge base details', async () => {
    mockGet.mockResolvedValue(knowledgeBase)

    const {error, stdout} = await testCommand(GetKnowledgeBaseCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('kb-abc123')
    expect(stdout).toContain('Support docs')
    expect(stdout).toContain('ready')
    expect(stdout).toContain('enabled (weekly)')
    expect(mockGet).toHaveBeenCalledWith('kb-abc123')
  })

  test('formats pending changes and disabled refresh', async () => {
    mockGet.mockResolvedValue({
      ...knowledgeBase,
      pendingChanges: {added: 2, changed: 1, removed: 0},
      refreshEnabled: false,
    })

    const {error, stdout} = await testCommand(GetKnowledgeBaseCommand, ['kb-abc123'])

    if (error) throw error
    expect(stdout).toContain('2 added, 1 changed, 0 removed')
    expect(stdout).toContain('disabled')
  })

  test('outputs JSON with --json', async () => {
    mockGet.mockResolvedValue(knowledgeBase)

    const {error, stdout} = await testCommand(GetKnowledgeBaseCommand, ['kb-abc123', '--json'])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(knowledgeBase)
  })

  test('requires the knowledgeBaseId argument', async () => {
    const {error} = await testCommand(GetKnowledgeBaseCommand, [])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('knowledgeBaseId')
    expect(mockGet).not.toHaveBeenCalled()
  })

  test('errors with a friendly message on 404', async () => {
    mockGet.mockRejectedValue(httpError(404))

    const {error} = await testCommand(GetKnowledgeBaseCommand, ['kb-missing'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockGet.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(GetKnowledgeBaseCommand, ['kb-abc123'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to get knowledge base')
    expect(error?.oclif?.exit).toBe(1)
  })
})

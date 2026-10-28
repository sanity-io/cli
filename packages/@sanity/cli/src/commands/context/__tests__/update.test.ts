import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../test/helpers/httpError.js'
import {parseArguments} from '../../../util/parseArguments.js'
import {UpdateKnowledgeBaseCommand} from '../update.js'
import {knowledgeBase} from './fixtures.js'

const mockEdit = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockGet = vi.hoisted(() => vi.fn())
const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    spinner: vi.fn().mockReturnValue({
      fail: vi.fn(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
    }),
  }
})

describe('context update', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {knowledgeBases: {edit: mockEdit, get: mockGet}},
      request: mockRequest,
    })
    mockGet.mockResolvedValue(knowledgeBase)
    mockRequest.mockResolvedValue([])
    mockEdit.mockResolvedValue(knowledgeBase)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('updates title and description', async () => {
    const {error, stdout} = await testCommand(UpdateKnowledgeBaseCommand, [
      'kb-abc123',
      '--title',
      '  New title  ',
      '--description',
      '  New description  ',
    ])

    if (error) throw error
    expect(stdout).toContain('Knowledge base updated')
    expect(mockEdit).toHaveBeenCalledWith('kb-abc123', {
      description: 'New description',
      title: 'New title',
    })
  })

  test('enables refresh with a frequency', async () => {
    const {error} = await testCommand(UpdateKnowledgeBaseCommand, [
      'kb-abc123',
      '--refresh-enabled',
      '--refresh-frequency',
      'monthly',
    ])

    if (error) throw error
    expect(mockEdit).toHaveBeenCalledWith('kb-abc123', {
      refreshEnabled: true,
      refreshFrequency: 'monthly',
    })
  })

  test('disables refresh with --no-refresh-enabled', async () => {
    const {error} = await testCommand(UpdateKnowledgeBaseCommand, [
      'kb-abc123',
      '--no-refresh-enabled',
    ])

    if (error) throw error
    expect(mockEdit).toHaveBeenCalledWith('kb-abc123', {refreshEnabled: false})
  })

  test('errors when no update flags are provided', async () => {
    const {error} = await testCommand(UpdateKnowledgeBaseCommand, ['kb-abc123'])

    expect(error).toBeInstanceOf(Error)
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('errors when --title flag is empty', async () => {
    const {error} = await testCommand(UpdateKnowledgeBaseCommand, ['kb-abc123', '--title', '  '])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Title cannot be empty')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('errors when --refresh-frequency has an invalid value', async () => {
    const {error} = await testCommand(UpdateKnowledgeBaseCommand, [
      'kb-abc123',
      '--refresh-frequency',
      'daily',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('errors with a friendly message on 404', async () => {
    mockEdit.mockRejectedValue(httpError(404))

    const {error} = await testCommand(UpdateKnowledgeBaseCommand, [
      'kb-missing',
      '--title',
      'New title',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Knowledge base "kb-missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when API call fails', async () => {
    mockEdit.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(UpdateKnowledgeBaseCommand, [
      'kb-abc123',
      '--title',
      'New title',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to update knowledge base')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('redacts title and description from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'update',
        'kb-abc123',
        '--title=Internal docs',
        '--description=Secret plans',
        '--refresh-frequency=weekly',
      ],
      UpdateKnowledgeBaseCommand,
    )

    expect(result.extraArguments).toEqual([
      '--title',
      '--description',
      '--refresh-frequency=weekly',
    ])
  })

  test('refuses a knowledge base a blueprint manages, naming its stack', async () => {
    mockRequest
      .mockResolvedValueOnce([{stackId: 'ST-1'}])
      .mockResolvedValueOnce({name: 'production'})

    const {error} = await testCommand(UpdateKnowledgeBaseCommand, [
      'kb-abc123',
      '--title',
      'New title',
    ])

    expect(error?.message).toContain(
      'The blueprint stack "production" manages the title and description of knowledge base "kb-abc123"',
    )
    expect(error?.message).toContain('Change them in the blueprint')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockEdit).not.toHaveBeenCalled()
    expect(mockRequest).toHaveBeenNthCalledWith(1, {
      headers: {
        'x-sanity-scope-id': knowledgeBase.organizationId,
        'x-sanity-scope-type': 'organization',
      },
      query: {id: knowledgeBase.publicId, type: 'sanity.context.knowledge-base'},
      uri: '/blueprints/resources/search',
    })
    expect(mockRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({uri: '/blueprints/stacks/ST-1'}),
    )
  })

  test('refuses without a stack name when the caller cannot read Blueprints', async () => {
    mockRequest.mockRejectedValueOnce(httpError(403, 'Managed', {errorCode: 'RESOURCE_MANAGED'}))

    const {error} = await testCommand(UpdateKnowledgeBaseCommand, [
      'kb-abc123',
      '--title',
      'New title',
    ])

    expect(error?.message).toContain(
      'A blueprint manages the title and description of knowledge base "kb-abc123"',
    )
    expect(error?.oclif?.exit).toBe(2)
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('goes ahead when no blueprint manages it or the lookup fails', async () => {
    mockRequest.mockRejectedValueOnce(
      httpError(404, 'Not managed', {errorCode: 'RESOURCE_NOT_MANAGED'}),
    )
    const notManaged = await testCommand(UpdateKnowledgeBaseCommand, [
      'kb-abc123',
      '--title',
      'New title',
    ])
    if (notManaged.error) throw notManaged.error

    mockRequest.mockRejectedValueOnce(httpError(503))
    const lookupFailed = await testCommand(UpdateKnowledgeBaseCommand, [
      'kb-abc123',
      '--title',
      'New title',
    ])
    if (lookupFailed.error) throw lookupFailed.error

    expect(mockEdit).toHaveBeenCalledTimes(2)
  })

  test('changes refresh settings without a lookup, since the blueprint does not manage them', async () => {
    for (const args of [
      ['kb-abc123', '--no-refresh-enabled'],
      ['kb-abc123', '--refresh-frequency', 'monthly'],
    ]) {
      const {error} = await testCommand(UpdateKnowledgeBaseCommand, args)
      if (error) throw error
    }

    expect(mockRequest).not.toHaveBeenCalled()
    expect(mockEdit).toHaveBeenNthCalledWith(1, 'kb-abc123', {refreshEnabled: false})
    expect(mockEdit).toHaveBeenNthCalledWith(2, 'kb-abc123', {refreshFrequency: 'monthly'})
  })

  test('refuses a title change mixed with refresh settings, and says refresh can change alone', async () => {
    mockRequest
      .mockResolvedValueOnce([{stackId: 'ST-1'}])
      .mockResolvedValueOnce({name: 'production'})

    const {error} = await testCommand(UpdateKnowledgeBaseCommand, [
      'kb-abc123',
      '--title',
      'New title',
      '--refresh-frequency',
      'monthly',
    ])

    expect(error?.message).toContain('Refresh settings are not managed by the blueprint')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockEdit).not.toHaveBeenCalled()
  })
})

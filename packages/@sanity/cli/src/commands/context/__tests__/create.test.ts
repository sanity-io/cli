import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {parseArguments} from '../../../util/parseArguments.js'
import {CreateKnowledgeBaseCommand} from '../create.js'
import {knowledgeBase} from './fixtures.js'

const mockCreate = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockInput = vi.hoisted(() => vi.fn())
const mockSelect = vi.hoisted(() => vi.fn())
const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: mockInput,
    select: mockSelect,
    spinner: vi.fn().mockReturnValue({
      fail: vi.fn(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
    }),
  }
})

describe('context create', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {knowledgeBases: {create: mockCreate}},
      request: mockRequest,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('creates knowledge base with flags', async () => {
    mockCreate.mockResolvedValue(knowledgeBase)

    const {error, stdout} = await testCommand(CreateKnowledgeBaseCommand, [
      '--organization',
      'org-abc123',
      '--title',
      'Support docs',
      '--description',
      'Product docs and troubleshooting guides',
    ])

    if (error) throw error
    expect(stdout).toContain('kb-abc123')
    expect(stdout).toContain('Support docs')
    expect(stdout).toContain('org-abc123')
    expect(mockCreate).toHaveBeenCalledWith({
      description: 'Product docs and troubleshooting guides',
      organizationId: 'org-abc123',
      title: 'Support docs',
    })
  })

  test('trims title and description before sending', async () => {
    mockCreate.mockResolvedValue(knowledgeBase)

    const {error} = await testCommand(CreateKnowledgeBaseCommand, [
      '--organization',
      'org-abc123',
      '--title',
      '  Support docs  ',
      '--description',
      '  Product docs  ',
    ])

    if (error) throw error
    expect(mockCreate).toHaveBeenCalledWith({
      description: 'Product docs',
      organizationId: 'org-abc123',
      title: 'Support docs',
    })
  })

  test('falls back to the CLI config organization', async () => {
    mockCreate.mockResolvedValue(knowledgeBase)

    const {error} = await testCommand(
      CreateKnowledgeBaseCommand,
      ['--title', 'Support docs', '--description', 'Product docs'],
      {mocks: {cliConfig: {app: {organizationId: 'org-from-config'}}}},
    )

    if (error) throw error
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({organizationId: 'org-from-config'}),
    )
  })

  test('prompts for organization, title and description when interactive', async () => {
    mockRequest.mockResolvedValue([{id: 'org-abc123', name: 'Acme', slug: null}])
    mockSelect.mockResolvedValue('org-abc123')
    mockInput.mockResolvedValueOnce('Prompted title').mockResolvedValueOnce('Prompted description')
    mockCreate.mockResolvedValue(knowledgeBase)

    const {error} = await testCommand(CreateKnowledgeBaseCommand, [], {
      mocks: {isInteractive: true},
    })

    if (error) throw error
    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({message: 'Select organization:'}),
    )
    expect(mockInput).toHaveBeenCalledWith(
      expect.objectContaining({message: 'Knowledge base title:', validate: expect.any(Function)}),
    )
    expect(mockCreate).toHaveBeenCalledWith({
      description: 'Prompted description',
      organizationId: 'org-abc123',
      title: 'Prompted title',
    })
  })

  test('errors when title and description are missing in a non-interactive environment', async () => {
    const {error} = await testCommand(
      CreateKnowledgeBaseCommand,
      ['--organization', 'org-abc123'],
      {mocks: {isInteractive: false}},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing required flag title')
    expect(error?.message).toContain('Missing required flag description')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockInput).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('errors when title is missing in a non-interactive environment', async () => {
    const {error} = await testCommand(
      CreateKnowledgeBaseCommand,
      ['--organization', 'org-abc123', '--description', 'Product docs'],
      {mocks: {isInteractive: false}},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing required flag title')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockInput).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('errors when description is missing in a non-interactive environment', async () => {
    const {error} = await testCommand(
      CreateKnowledgeBaseCommand,
      ['--organization', 'org-abc123', '--title', 'Support docs'],
      {mocks: {isInteractive: false}},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Missing required flag description')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockInput).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('creates without prompting when all flags are provided in a non-interactive environment', async () => {
    mockCreate.mockResolvedValue(knowledgeBase)

    const {error} = await testCommand(
      CreateKnowledgeBaseCommand,
      ['--organization', 'org-abc123', '--title', 'Support docs', '--description', 'Product docs'],
      {mocks: {isInteractive: false}},
    )

    if (error) throw error
    expect(mockInput).not.toHaveBeenCalled()
    expect(mockCreate).toHaveBeenCalledWith({
      description: 'Product docs',
      organizationId: 'org-abc123',
      title: 'Support docs',
    })
  })

  test('errors when --title is whitespace-only instead of prompting', async () => {
    const {error} = await testCommand(
      CreateKnowledgeBaseCommand,
      ['--organization', 'org-abc123', '--title', '  ', '--description', 'Product docs'],
      {mocks: {isInteractive: true}},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Title cannot be empty')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockInput).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('errors when --description is whitespace-only instead of prompting', async () => {
    const {error} = await testCommand(
      CreateKnowledgeBaseCommand,
      ['--organization', 'org-abc123', '--title', 'Support docs', '--description', '  '],
      {mocks: {isInteractive: true}},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Description cannot be empty')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockInput).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('errors when organization resolution fails at the prompt', async () => {
    mockRequest.mockRejectedValue(new Error('org list boom'))

    const {error} = await testCommand(
      CreateKnowledgeBaseCommand,
      ['--title', 'Support docs', '--description', 'Product docs'],
      {mocks: {isInteractive: true}},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.oclif?.exit).toBe(1)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('errors when organization is missing in a non-interactive environment', async () => {
    const {error} = await testCommand(
      CreateKnowledgeBaseCommand,
      ['--title', 'Support docs', '--description', 'Product docs'],
      {mocks: {isInteractive: false}},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Organization ID is required')
    expect(error?.message).toContain('--organization')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('errors when --organization flag is empty', async () => {
    const {error} = await testCommand(CreateKnowledgeBaseCommand, [
      '--organization',
      '  ',
      '--title',
      'Support docs',
      '--description',
      'Product docs',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('`--organization` cannot be empty')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('errors when API call fails', async () => {
    mockCreate.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(CreateKnowledgeBaseCommand, [
      '--organization',
      'org-abc123',
      '--title',
      'Support docs',
      '--description',
      'Product docs',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to create knowledge base')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('redacts title and description from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'create',
        '--title=Internal docs',
        '--description=Secret plans',
        '--organization=org-abc123',
      ],
      CreateKnowledgeBaseCommand.telemetry,
    )

    expect(result.extraArguments).toEqual(['--title', '--description', '--organization=org-abc123'])
  })
})

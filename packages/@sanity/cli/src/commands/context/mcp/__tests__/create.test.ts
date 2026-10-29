import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {parseArguments} from '../../../../util/parseArguments.js'
import {CreateMcpEndpointCommand} from '../create.js'
import {mcpEndpoint} from './fixtures.js'

const mockCreate = vi.hoisted(() => vi.fn())
const mockInput = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: mockInput,
    spinner: vi.fn().mockReturnValue({
      fail: vi.fn(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
    }),
  }
})

const base = ['support', '--organization', 'org-abc123']

describe('context mcp create', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {mcpEndpoints: {create: mockCreate}}})
    mockCreate.mockResolvedValue(mcpEndpoint)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('creates an endpoint from knowledge bases and a dataset with its settings', async () => {
    const {error, stdout} = await testCommand(CreateMcpEndpointCommand, [
      ...base,
      '--title',
      ' Support ',
      '--knowledge-base',
      'kb-abc123',
      '--knowledge-base',
      'kb-def456',
      '--project',
      'proj1',
      '--dataset',
      'production',
      '--workspace',
      'default',
      '--perspective',
      'drafts',
      '--no-semantic-search',
      '--instructions',
      'Answer support questions.',
      '--groq-filter',
      '_type == "product"',
    ])

    if (error) throw error
    expect(mockCreate).toHaveBeenCalledWith({
      groqFilter: '_type == "product"',
      instructions: 'Answer support questions.',
      name: 'support',
      sources: [
        {id: 'kb-abc123', type: 'knowledge-base'},
        {id: 'kb-def456', type: 'knowledge-base'},
        {
          id: 'proj1.production',
          perspective: 'drafts',
          semanticSearch: false,
          type: 'dataset',
          workspace: 'default',
        },
      ],
      title: 'Support',
    })
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({context: {organizationId: 'org-abc123'}}),
    )
    expect(stdout).toContain(`URL:             ${mcpEndpoint.url}`)
  })

  test('prompts for the title when it is not passed', async () => {
    mockInput.mockResolvedValue(' Prompted ')

    const {error} = await testCommand(
      CreateMcpEndpointCommand,
      [...base, '--knowledge-base', 'kb-abc123'],
      {mocks: {isInteractive: true}},
    )

    if (error) throw error
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({title: 'Prompted'}))
  })

  test('requires --title when unattended', async () => {
    const {error} = await testCommand(
      CreateMcpEndpointCommand,
      [...base, '--knowledge-base', 'kb-abc123'],
      {mocks: {isInteractive: false}},
    )

    expect(error?.message).toContain('Missing required flag title')
    expect(mockInput).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('requires a source', async () => {
    const {error} = await testCommand(CreateMcpEndpointCommand, [...base, '--title', 'Support'])

    expect(error?.message).toContain('--knowledge-base')
    expect(error?.message).toContain('--dataset')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('requires --dataset with dataset settings', async () => {
    const {error} = await testCommand(CreateMcpEndpointCommand, [
      ...base,
      '--title',
      'Support',
      '--knowledge-base',
      'kb-abc123',
      '--perspective',
      'drafts',
    ])

    expect(error?.message).toContain('--dataset')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('takes the dataset project from the CLI configuration', async () => {
    const {error} = await testCommand(
      CreateMcpEndpointCommand,
      [...base, '--title', 'Support', '--dataset', 'production'],
      {mocks: {cliConfig: {api: {projectId: 'proj-config'}}}},
    )

    if (error) throw error
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({sources: [{id: 'proj-config.production', type: 'dataset'}]}),
    )
  })

  test('requires a project for --dataset outside a project directory', async () => {
    const {error} = await testCommand(CreateMcpEndpointCommand, [
      ...base,
      '--title',
      'Support',
      '--dataset',
      'production',
    ])

    expect(error?.message).toContain('Pass `--project` with `--dataset`')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('rejects a blank name', async () => {
    const {error} = await testCommand(CreateMcpEndpointCommand, [
      ' ',
      '--organization',
      'org-abc123',
      '--title',
      'Support',
      '--knowledge-base',
      'kb-abc123',
    ])

    expect(error?.message).toContain('The MCP endpoint name cannot be empty')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('rejects an empty --instructions', async () => {
    const {error} = await testCommand(CreateMcpEndpointCommand, [
      ...base,
      '--title',
      'Support',
      '--knowledge-base',
      'kb-abc123',
      '--instructions',
      ' ',
    ])

    expect(error?.message).toContain('`--instructions` cannot be empty if provided')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('rejects an empty --knowledge-base', async () => {
    const {error} = await testCommand(CreateMcpEndpointCommand, [
      ...base,
      '--title',
      'Support',
      '--knowledge-base',
      'kb-abc123',
      '--knowledge-base',
      ' ',
    ])

    expect(error?.message).toContain('`--knowledge-base` cannot be empty if provided')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('errors when the API call fails', async () => {
    mockCreate.mockRejectedValue(new Error('Name taken'))

    const {error} = await testCommand(CreateMcpEndpointCommand, [
      ...base,
      '--title',
      'Support',
      '--knowledge-base',
      'kb-abc123',
    ])

    expect(error?.message).toContain('Failed to create MCP endpoint: Name taken')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('redacts title, instructions and GROQ filter from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'mcp',
        'create',
        'support',
        '--title=Internal',
        '--instructions=Secret plans',
        '--groq-filter=_type == "secret"',
        '--dataset=production',
      ],
      CreateMcpEndpointCommand,
    )

    expect(result.extraArguments).toEqual([
      '--title',
      '--instructions',
      '--groq-filter',
      '--dataset=production',
    ])
  })
})

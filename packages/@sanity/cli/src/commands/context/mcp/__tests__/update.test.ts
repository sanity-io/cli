import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {parseArguments} from '../../../../util/parseArguments.js'
import {UpdateMcpEndpointCommand} from '../update.js'
import {mcpDoc, mcpEndpoint, withConfig} from './fixtures.js'

const mockEdit = vi.hoisted(() => vi.fn())
const mockGet = vi.hoisted(() => vi.fn())
const mockRequest = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

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

const base = ['support', '--organization', 'org-abc123']

describe('context mcp update', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {mcpEndpoints: {edit: mockEdit, get: mockGet}},
      request: mockRequest,
      withConfig,
    })
    mockGet.mockResolvedValue(mcpDoc)
    mockRequest.mockResolvedValue([])
    mockEdit.mockResolvedValue(mcpEndpoint)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('sends only the fields passed, and clears instructions and GROQ filter with ""', async () => {
    const {error, stdout} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--title',
      ' Customer support ',
      '--instructions',
      '',
      '--groq-filter',
      '',
    ])

    if (error) throw error
    expect(mockEdit).toHaveBeenCalledWith({
      groqFilter: null,
      instructions: null,
      name: 'support',
      title: 'Customer support',
    })
    expect(stdout).toContain(`URL:             ${mcpEndpoint.url}`)
  })

  test('adds and removes knowledge bases, keeping the dataset and its settings', async () => {
    const {error} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--add-knowledge-base',
      'kb-def456',
      '--remove-knowledge-base',
      'kb-abc123',
    ])

    if (error) throw error
    expect(mockEdit).toHaveBeenCalledWith({
      name: 'support',
      sources: [{id: 'kb-def456', type: 'knowledge-base'}, mcpDoc.sources[1]],
    })
  })

  test('notes knowledge bases that are already added or not there, without failing', async () => {
    const {error, stderr} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--add-knowledge-base',
      'kb-abc123',
      '--remove-knowledge-base',
      'kb-missing',
    ])

    if (error) throw error
    expect(stderr).toContain('Knowledge base "kb-abc123" is already a source')
    expect(stderr).toContain('Knowledge base "kb-missing" is not a source')
    expect(mockEdit).toHaveBeenCalledWith({name: 'support', sources: mcpDoc.sources})
  })

  test('adds a knowledge base passed twice once, without a note', async () => {
    const {error, stderr} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--add-knowledge-base',
      'kb-def456',
      '--add-knowledge-base',
      'kb-def456',
    ])

    if (error) throw error
    expect(stderr).not.toContain('already a source')
    expect(mockEdit).toHaveBeenCalledWith({
      name: 'support',
      sources: [mcpDoc.sources[0], {id: 'kb-def456', type: 'knowledge-base'}, mcpDoc.sources[1]],
    })
  })

  test('adds a dataset to an endpoint that has none', async () => {
    mockGet.mockResolvedValue({...mcpDoc, sources: [{id: 'kb-abc123', type: 'knowledge-base'}]})

    const {error} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--dataset',
      'proj2.staging',
    ])

    if (error) throw error
    expect(mockEdit).toHaveBeenCalledWith({
      name: 'support',
      sources: [
        {id: 'kb-abc123', type: 'knowledge-base'},
        {id: 'proj2.staging', type: 'dataset'},
      ],
    })
  })

  test('notes --no-dataset on an endpoint without a dataset', async () => {
    mockGet.mockResolvedValue({...mcpDoc, sources: [{id: 'kb-abc123', type: 'knowledge-base'}]})

    const {error, stderr} = await testCommand(UpdateMcpEndpointCommand, [...base, '--no-dataset'])

    if (error) throw error
    expect(stderr).toContain('The endpoint has no dataset')
  })

  test('starts a different dataset from the settings passed alongside it', async () => {
    const {error} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--dataset',
      'proj2.staging',
      '--perspective',
      'raw',
    ])

    if (error) throw error
    expect(mockEdit).toHaveBeenCalledWith({
      name: 'support',
      sources: [
        {id: 'kb-abc123', type: 'knowledge-base'},
        {id: 'proj2.staging', perspective: 'raw', type: 'dataset'},
      ],
    })
  })

  test('keeps the settings when --dataset names the current dataset', async () => {
    const {error} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--dataset',
      'proj1.production',
      '--perspective',
      'raw',
    ])

    if (error) throw error
    expect(mockEdit).toHaveBeenCalledWith({
      name: 'support',
      sources: [
        {id: 'kb-abc123', type: 'knowledge-base'},
        {...mcpDoc.sources[1], perspective: 'raw'},
      ],
    })
  })

  test('stops serving the dataset with --no-dataset', async () => {
    const {error} = await testCommand(UpdateMcpEndpointCommand, [...base, '--no-dataset'])

    if (error) throw error
    expect(mockEdit).toHaveBeenCalledWith({
      name: 'support',
      sources: [{id: 'kb-abc123', type: 'knowledge-base'}],
    })
  })

  test('changes only the passed settings of the current dataset, dropping unknown source fields', async () => {
    mockGet.mockResolvedValue({
      ...mcpDoc,
      sources: [{_key: 'k1', id: 'kb-abc123', type: 'knowledge-base'}, ...mcpDoc.sources.slice(1)],
    })

    const {error} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--semantic-search',
      '--workspace',
      '',
    ])

    if (error) throw error
    expect(mockEdit).toHaveBeenCalledWith({
      name: 'support',
      sources: [
        {id: 'kb-abc123', type: 'knowledge-base'},
        {
          id: 'proj1.production',
          perspective: 'drafts',
          semanticSearch: true,
          type: 'dataset',
          workspace: null,
        },
      ],
    })
  })

  test('refuses dataset settings when the endpoint has no dataset source', async () => {
    mockGet.mockResolvedValue({...mcpDoc, sources: [{id: 'kb-abc123', type: 'knowledge-base'}]})

    const {error} = await testCommand(UpdateMcpEndpointCommand, [...base, '--perspective', 'raw'])

    expect(error?.message).toContain('MCP endpoint "support" has no dataset source')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('refuses a GROQ filter when the endpoint has no dataset source', async () => {
    mockGet.mockResolvedValue({...mcpDoc, sources: [{id: 'kb-abc123', type: 'knowledge-base'}]})

    const {error} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--groq-filter',
      '_type == "post"',
    ])

    expect(error?.message).toContain('MCP endpoint "support" has no dataset source')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('sends a GROQ filter alone without touching the sources', async () => {
    const {error} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--groq-filter',
      '_type == "post"',
    ])

    if (error) throw error
    expect(mockEdit).toHaveBeenCalledWith({groqFilter: '_type == "post"', name: 'support'})
  })

  test('refuses to remove the last source', async () => {
    mockGet.mockResolvedValue({...mcpDoc, sources: [{id: 'kb-abc123', type: 'knowledge-base'}]})

    const {error} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--remove-knowledge-base',
      'kb-abc123',
    ])

    expect(error?.message).toContain('An MCP endpoint needs at least one knowledge base or dataset')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('errors when a source change targets an endpoint that does not exist', async () => {
    mockGet.mockResolvedValue(null)

    const {error} = await testCommand(UpdateMcpEndpointCommand, [...base, '--perspective', 'raw'])

    expect(error?.message).toContain('MCP endpoint "support" not found')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('errors when reading the current sources fails', async () => {
    mockGet.mockRejectedValue(new Error('Store unavailable'))

    const {error} = await testCommand(UpdateMcpEndpointCommand, [...base, '--perspective', 'raw'])

    expect(error?.message).toContain('Failed to get MCP endpoint: Store unavailable')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('points --knowledge-base users to the add and remove flags', async () => {
    const {error} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--knowledge-base',
      'kb-def456',
    ])

    expect(error?.message).toContain('Use `--add-knowledge-base` or `--remove-knowledge-base`')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('rejects --no-dataset together with dataset settings', async () => {
    const {error} = await testCommand(UpdateMcpEndpointCommand, [
      ...base,
      '--no-dataset',
      '--perspective',
      'raw',
    ])

    expect(error?.message).toContain('`--no-dataset` cannot be combined with')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('requires at least one change', async () => {
    const {error} = await testCommand(UpdateMcpEndpointCommand, base)

    expect(error?.message).toContain('--title')
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('rejects an empty --title', async () => {
    const {error} = await testCommand(UpdateMcpEndpointCommand, [...base, '--title', ' '])

    expect(error?.message).toContain('`--title` cannot be empty')
    expect(mockEdit).not.toHaveBeenCalled()
  })

  test('refuses an endpoint a blueprint manages, naming its stack', async () => {
    mockRequest
      .mockResolvedValueOnce([{stackId: 'ST-1'}])
      .mockResolvedValueOnce({name: 'production'})

    const {error} = await testCommand(UpdateMcpEndpointCommand, [...base, '--title', 'New'])

    expect(error?.message).toContain(
      'The blueprint stack "production" manages MCP endpoint "support"',
    )
    expect(error?.oclif?.exit).toBe(2)
    expect(mockEdit).not.toHaveBeenCalled()
    expect(mockRequest).toHaveBeenNthCalledWith(1, {
      headers: {'x-sanity-scope-id': 'org-abc123', 'x-sanity-scope-type': 'organization'},
      query: {id: 'mcpabc123', type: 'sanity.context.mcp'},
      url: '/blueprints/resources/search',
    })
  })

  test('skips the blueprint lookup for an endpoint that does not exist', async () => {
    mockGet.mockResolvedValue(null)
    mockEdit.mockRejectedValue(httpError(404))

    const {error} = await testCommand(UpdateMcpEndpointCommand, [...base, '--title', 'New'])

    expect(error?.message).toContain('MCP endpoint "support" not found')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockRequest).not.toHaveBeenCalled()
  })

  test('errors when the API call fails', async () => {
    mockEdit.mockRejectedValue(new Error('Invalid filter'))

    const {error} = await testCommand(UpdateMcpEndpointCommand, [...base, '--title', 'New'])

    expect(error?.message).toContain('Failed to update MCP endpoint: Invalid filter')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('redacts title, instructions and GROQ filter from command telemetry', () => {
    const result = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'mcp',
        'update',
        'support',
        '--title=Internal',
        '--instructions=Secret plans',
        '--groq-filter=_type == "secret"',
        '--perspective=raw',
      ],
      UpdateMcpEndpointCommand,
    )

    expect(result.extraArguments).toEqual([
      '--title',
      '--instructions',
      '--groq-filter',
      '--perspective=raw',
    ])
  })
})

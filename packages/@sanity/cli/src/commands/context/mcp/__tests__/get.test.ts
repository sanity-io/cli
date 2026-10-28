import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {GetMcpEndpointCommand} from '../get.js'
import {mcpDoc, mcpEndpoint, withConfig} from './fixtures.js'

const mockGet = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context mcp get', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {fetch: mockGet}, withConfig})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints the endpoint with its URL, sources and dataset settings', async () => {
    mockGet.mockResolvedValue(mcpDoc)

    const {error, stdout} = await testCommand(GetMcpEndpointCommand, [
      'support',
      '--organization',
      'org-abc123',
    ])

    if (error) throw error
    expect(stdout).toBe(
      [
        '  ID:              mcpabc123',
        '  Name:            support',
        '  Title:           Support',
        `  URL:             ${mcpEndpoint.url}`,
        '  Knowledge bases: kb-abc123',
        '  Dataset:         proj1.production',
        '  Workspace:       default',
        '  Perspective:     drafts',
        '  Semantic search: off',
        '  Instructions:    Answer support questions.',
        '  GROQ filter:     _type == "product"',
        '',
      ].join('\n'),
    )
    expect(mockGet).toHaveBeenCalledWith(expect.stringContaining('publicId == $nameOrId'), {
      nameOrId: 'support',
      org: 'org-abc123',
    })
  })

  test('leaves out dataset settings when the endpoint has no dataset', async () => {
    mockGet.mockResolvedValue({
      ...mcpDoc,
      groqFilter: null,
      instructions: null,
      sources: [{id: 'kb-abc123', type: 'knowledge-base'}],
    })

    const {error, stdout} = await testCommand(GetMcpEndpointCommand, [
      'support',
      '--organization',
      'org-abc123',
    ])

    if (error) throw error
    expect(stdout).toContain('Dataset:         -')
    expect(stdout).not.toContain('Workspace')
    expect(stdout).toContain('Instructions:    -')
  })

  test('shows semantic search turned on', async () => {
    mockGet.mockResolvedValue({
      ...mcpDoc,
      sources: [{...mcpDoc.sources[1], semanticSearch: true}],
    })

    const {error, stdout} = await testCommand(GetMcpEndpointCommand, [
      'support',
      '--organization',
      'org-abc123',
    ])

    if (error) throw error
    expect(stdout).toContain('Semantic search: on')
    expect(stdout).toContain('Knowledge bases: -')
  })

  test('outputs the endpoint with its URL as JSON with --json', async () => {
    mockGet.mockResolvedValue(mcpDoc)

    const {error, stdout} = await testCommand(GetMcpEndpointCommand, [
      'support',
      '--organization',
      'org-abc123',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual({...mcpDoc, url: mcpEndpoint.url})
  })

  test('errors when no endpoint has that name', async () => {
    mockGet.mockResolvedValue(null)

    const {error} = await testCommand(GetMcpEndpointCommand, [
      'missing',
      '--organization',
      'org-abc123',
    ])

    expect(error?.message).toContain('MCP endpoint "missing" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockGet.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(GetMcpEndpointCommand, [
      'support',
      '--organization',
      'org-abc123',
    ])

    expect(error?.message).toContain('Failed to get MCP endpoint: Server error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

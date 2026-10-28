import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {McpEndpointStatusCommand} from '../status.js'

const mockStatus = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

const base = ['support', '--organization', 'org-abc123']

const status = {
  checks: {
    knowledgeBases: {
      denied: [],
      error: 'Knowledge base kb-def456 has not been built.',
      missing: [],
      ok: false,
      resolved: ['kb-abc123', 'kb-def456'],
      unbuilt: ['kb-def456'],
    },
    schema: {documentTypes: 12, ok: true, perspective: 'drafts'},
    semanticSearch: {
      active: false,
      inactiveReason: 'turnedOff',
      ok: true,
      status: null,
      withinUsageLimit: null,
    },
    studio: null,
  },
  requiredOk: false,
}

describe('context mcp status', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {mcpEndpoints: {status: mockStatus}}})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints each check, with "-" for checks that do not apply', async () => {
    mockStatus.mockResolvedValue(status)

    const {error, stdout} = await testCommand(McpEndpointStatusCommand, base)

    if (error) throw error
    expect(stdout).toBe(
      [
        '  Studio:          -',
        '  Schema:          ok (12 document types, drafts perspective)',
        '  Knowledge bases: failed: Knowledge base kb-def456 has not been built.',
        '  Semantic search: ok (inactive: turnedOff)',
        '  Ready:           no',
        '',
      ].join('\n'),
    )
    expect(mockStatus).toHaveBeenCalledWith({name: 'support'})
  })

  test('describes passing checks', async () => {
    mockStatus.mockResolvedValue({
      checks: {
        knowledgeBases: {ok: true, resolved: ['kb-abc123']},
        schema: {documentTypes: 3, ok: true, perspective: 'published'},
        semanticSearch: {
          active: true,
          inactiveReason: null,
          ok: true,
          status: 'ready',
          withinUsageLimit: true,
        },
        studio: {
          availableWorkspaces: [{name: 'default', title: 'Default'}],
          ok: true,
          workspace: 'default',
          workspaceAutoSelected: true,
          workspaceTitle: 'Default',
        },
      },
      requiredOk: true,
    })

    const {error, stdout} = await testCommand(McpEndpointStatusCommand, base)

    if (error) throw error
    expect(stdout).toBe(
      [
        '  Studio:          ok (workspace "default")',
        '  Schema:          ok (3 document types, published perspective)',
        '  Knowledge bases: ok (kb-abc123)',
        '  Semantic search: ok (active)',
        '  Ready:           yes',
        '',
      ].join('\n'),
    )
  })

  test('outputs the status as JSON with --json', async () => {
    mockStatus.mockResolvedValue(status)

    const {error, stdout} = await testCommand(McpEndpointStatusCommand, [...base, '--json'])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual(status)
  })

  test('errors when no endpoint has that name', async () => {
    mockStatus.mockRejectedValue(httpError(404))

    const {error} = await testCommand(McpEndpointStatusCommand, base)

    expect(error?.message).toContain('MCP endpoint "support" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when the API call fails', async () => {
    mockStatus.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(McpEndpointStatusCommand, base)

    expect(error?.message).toContain('Failed to check MCP endpoint: Server error')
  })
})

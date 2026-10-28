import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {httpError} from '../../../../../test/helpers/httpError.js'
import {DeleteMcpEndpointCommand} from '../delete.js'
import {mcpDoc, withConfig} from './fixtures.js'

const mockDelete = vi.hoisted(() => vi.fn())
const mockGet = vi.hoisted(() => vi.fn())
const mockRequest = vi.hoisted(() => vi.fn())
const mockConfirm = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {...actual, confirm: mockConfirm}
})

const base = ['support', '--organization', 'org-abc123']

describe('context mcp delete', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {fetch: mockGet, mcpEndpoints: {delete: mockDelete}},
      request: mockRequest,
      withConfig,
    })
    mockGet.mockResolvedValue(mcpDoc)
    mockRequest.mockResolvedValue([])
    mockDelete.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('deletes the endpoint after confirmation', async () => {
    mockConfirm.mockResolvedValue(true)

    const {error, stdout} = await testCommand(DeleteMcpEndpointCommand, base, {
      mocks: {isInteractive: true},
    })

    if (error) throw error
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({message: expect.stringContaining('Delete MCP endpoint "support"?')}),
    )
    expect(mockDelete).toHaveBeenCalledWith({name: 'support'})
    expect(stdout).toContain('MCP endpoint deleted')
  })

  test('keeps the endpoint when confirmation is declined', async () => {
    mockConfirm.mockResolvedValue(false)

    const {error, stdout} = await testCommand(DeleteMcpEndpointCommand, base, {
      mocks: {isInteractive: true},
    })

    expect(stdout).toContain('MCP endpoint not deleted')
    expect(error?.oclif?.exit).toBe(3)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('deletes without asking with --yes', async () => {
    const {error} = await testCommand(DeleteMcpEndpointCommand, [...base, '--yes'])

    if (error) throw error
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockDelete).toHaveBeenCalledWith({name: 'support'})
  })

  test('requires --yes when unattended', async () => {
    const {error} = await testCommand(DeleteMcpEndpointCommand, base, {
      mocks: {isInteractive: false},
    })

    expect(error?.message).toContain('Pass `--yes` to delete the MCP endpoint')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('refuses an endpoint a blueprint manages, naming its stack', async () => {
    mockRequest
      .mockResolvedValueOnce([{stackId: 'ST-1'}])
      .mockResolvedValueOnce({name: 'production'})

    const {error} = await testCommand(DeleteMcpEndpointCommand, [...base, '--yes'])

    expect(error?.message).toContain(
      'The blueprint stack "production" manages MCP endpoint "support"',
    )
    expect(error?.message).toContain("deletionPolicy: 'allow'")
    expect(error?.oclif?.exit).toBe(2)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('refuses a blueprint-managed endpoint addressed by its ID', async () => {
    mockRequest.mockRejectedValueOnce(httpError(403, 'Managed', {errorCode: 'RESOURCE_MANAGED'}))

    const {error} = await testCommand(DeleteMcpEndpointCommand, [
      'mcpabc123',
      '--organization',
      'org-abc123',
      '--yes',
    ])

    expect(error?.message).toContain('A blueprint manages MCP endpoint "mcpabc123"')
    expect(mockGet).toHaveBeenCalledWith(expect.any(String), {
      nameOrId: 'mcpabc123',
      org: 'org-abc123',
    })
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({query: {id: 'mcpabc123', type: 'sanity.context.mcp'}}),
    )
    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('refuses a blueprint-managed endpoint before asking for confirmation', async () => {
    mockRequest.mockResolvedValueOnce([{stackId: 'ST-1'}]).mockRejectedValueOnce(httpError(500))

    const {error} = await testCommand(DeleteMcpEndpointCommand, base, {
      mocks: {isInteractive: true},
    })

    expect(error?.message).toContain('A blueprint manages MCP endpoint "support"')
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(mockDelete).not.toHaveBeenCalled()
  })

  test('errors when the API call fails', async () => {
    mockDelete.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(DeleteMcpEndpointCommand, [...base, '--yes'])

    expect(error?.message).toContain('Failed to delete MCP endpoint: Server error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when no endpoint has that name', async () => {
    mockGet.mockResolvedValue(null)
    mockDelete.mockRejectedValue(httpError(404))

    const {error} = await testCommand(DeleteMcpEndpointCommand, [...base, '--yes'])

    expect(error?.message).toContain('MCP endpoint "support" not found')
    expect(error?.oclif?.exit).toBe(1)
  })
})

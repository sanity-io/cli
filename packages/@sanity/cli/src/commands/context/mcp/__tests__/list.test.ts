import {testCommand} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ListMcpEndpointsCommand} from '../list.js'
import {mcpDoc, mcpEndpoint, withConfig} from './fixtures.js'

const mockList = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

describe('context mcp list', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({
      context: {mcpEndpoints: {list: mockList}},
      withConfig,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('prints each endpoint with its sources and connection URL', async () => {
    mockList.mockResolvedValue([mcpDoc])

    const {error, stdout} = await testCommand(ListMcpEndpointsCommand, [
      '--organization',
      'org-abc123',
    ])

    if (error) throw error
    expect(stdout).toContain('support')
    expect(stdout).toContain('kb-abc123, proj1.production')
    expect(stdout).toContain(mcpEndpoint.url)
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({context: {organizationId: 'org-abc123'}}),
    )
  })

  test('outputs endpoints with their URLs as JSON with --json', async () => {
    mockList.mockResolvedValue([mcpDoc])

    const {error, stdout} = await testCommand(ListMcpEndpointsCommand, [
      '--organization',
      'org-abc123',
      '--json',
    ])

    if (error) throw error
    expect(JSON.parse(stdout)).toEqual([{...mcpDoc, url: mcpEndpoint.url}])
  })

  test('says so when the organization has no endpoints', async () => {
    mockList.mockResolvedValue([])

    const {error, stdout} = await testCommand(ListMcpEndpointsCommand, [
      '--organization',
      'org-abc123',
    ])

    if (error) throw error
    expect(stdout).toBe('No MCP endpoints found\n')
  })

  test('requires --organization when unattended and none is configured', async () => {
    const {error} = await testCommand(ListMcpEndpointsCommand, [], {
      mocks: {isInteractive: false},
    })

    expect(error?.message).toContain('Organization ID is required')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockList).not.toHaveBeenCalled()
  })

  test('errors when the API call fails', async () => {
    mockList.mockRejectedValue(new Error('Server error'))

    const {error} = await testCommand(ListMcpEndpointsCommand, ['--organization', 'org-abc123'])

    expect(error?.message).toContain('Failed to list MCP endpoints: Server error')
    expect(error?.oclif?.exit).toBe(1)
  })
})

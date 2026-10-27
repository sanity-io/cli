import {testCommand} from '@sanity/cli-test'
import {select} from '@sanity/cli-test/mocks/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {parseArguments} from '../../../util/parseArguments.js'
import {QueryContextCommand} from '../query.js'

const mockFetch = vi.hoisted(() => vi.fn())
const mockGetGlobalCliClient = vi.hoisted(() => vi.fn())
const mockRequest = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, getGlobalCliClient: mockGetGlobalCliClient}
})

vi.mock('@sanity/cli-core/ux', () => import('@sanity/cli-test/mocks/cli-core/ux'))

const QUERY = '*[_type == "sanity.context.issue"]{_id}'
const result = [{_id: 'issue.def456'}]

describe('context query', () => {
  beforeEach(() => {
    mockGetGlobalCliClient.mockResolvedValue({context: {fetch: mockFetch}, request: mockRequest})
    mockFetch.mockResolvedValue(result)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('runs the query against the organization and prints the result', async () => {
    const {error, stdout} = await testCommand(QueryContextCommand, [
      QUERY,
      '--organization',
      'org-abc123',
    ])

    if (error) throw error
    expect(mockFetch).toHaveBeenCalledWith(QUERY, undefined)
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({context: {organizationId: 'org-abc123'}}),
    )
    expect(mockGetGlobalCliClient).toHaveBeenCalledTimes(1)
    expect(mockGetGlobalCliClient.mock.calls[0][0]).not.toHaveProperty('resource')
    expect(stdout).toContain('issue.def456')
  })

  test('prints plain JSON with --json', async () => {
    const {error, stdout} = await testCommand(QueryContextCommand, [
      QUERY,
      '--organization',
      'org-abc123',
      '--json',
    ])

    if (error) throw error
    expect(stdout).toBe(`${JSON.stringify(result, null, 2)}\n`)
  })

  test.each([null, undefined])('prints %s as null in both output modes', async (value) => {
    mockFetch.mockResolvedValue(value)

    const colorized = await testCommand(QueryContextCommand, [
      QUERY,
      '--organization',
      'org-abc123',
    ])

    if (colorized.error) throw colorized.error
    expect(colorized.stdout).toBe('null\n')

    const {error, stdout} = await testCommand(QueryContextCommand, [
      QUERY,
      '--organization',
      'org-abc123',
      '--json',
    ])

    if (error) throw error
    expect(stdout).toBe('null\n')
  })

  test('passes --params to the query', async () => {
    const {error} = await testCommand(QueryContextCommand, [
      '*[knowledgeBaseId == $kb]',
      '--organization',
      'org-abc123',
      '--params',
      '{"kb": "kb-abc123", "limit": 5}',
    ])

    if (error) throw error
    expect(mockFetch).toHaveBeenCalledWith('*[knowledgeBaseId == $kb]', {
      kb: 'kb-abc123',
      limit: 5,
    })
  })

  test.each([
    ['not json', '`--params` must be valid JSON'],
    ['[1, 2]', '`--params` must be a JSON object'],
    ['null', '`--params` must be a JSON object'],
    ['"kb"', '`--params` must be a JSON object'],
  ])('rejects --params %s', async (params, message) => {
    const {error} = await testCommand(QueryContextCommand, [
      QUERY,
      '--organization',
      'org-abc123',
      '--params',
      params,
    ])

    expect(error?.message).toContain(message)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('falls back to the CLI config organization', async () => {
    const {error} = await testCommand(QueryContextCommand, [QUERY], {
      mocks: {cliConfig: {app: {organizationId: 'org-from-config'}}},
    })

    if (error) throw error
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({context: {organizationId: 'org-from-config'}}),
    )
  })

  test('prompts for organization when interactive', async () => {
    mockRequest.mockResolvedValue([{id: 'org-abc123', name: 'Acme', slug: null}])
    select.mockResolvedValueOnce('org-abc123')

    const {error} = await testCommand(QueryContextCommand, [QUERY], {
      mocks: {isInteractive: true},
    })

    if (error) throw error
    expect(select).toHaveBeenCalledWith(expect.objectContaining({message: 'Select organization:'}))
    expect(mockGetGlobalCliClient).toHaveBeenCalledWith(
      expect.objectContaining({context: {organizationId: 'org-abc123'}}),
    )
  })

  test('errors when organization is missing in a non-interactive environment', async () => {
    const {error} = await testCommand(QueryContextCommand, [QUERY], {
      mocks: {isInteractive: false},
    })

    expect(error?.message).toContain('Organization ID is required')
    expect(error?.oclif?.exit).toBe(2)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('errors when organization resolution fails at the prompt', async () => {
    mockRequest.mockRejectedValue(new Error('Network down'))

    const {error} = await testCommand(QueryContextCommand, [QUERY], {
      mocks: {isInteractive: true},
    })

    expect(error?.message).toContain('Network down')
    expect(error?.oclif?.exit).toBe(1)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  test('errors when the query fails', async () => {
    mockFetch.mockRejectedValue(new Error('expected "]" following array body'))

    const {error} = await testCommand(QueryContextCommand, ['*[', '--organization', 'org-abc123'])

    expect(error?.message).toBe('Failed to run query: expected "]" following array body')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('redacts --params from command telemetry', () => {
    const parsed = parseArguments(
      [
        'node',
        'sanity',
        'context',
        'query',
        QUERY,
        '--params={"email": "jane@example.com"}',
        '--organization=org-abc123',
      ],
      QueryContextCommand,
    )

    expect(parsed.extraArguments).toEqual(['--params', '--organization=org-abc123'])
  })
})

import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {USER_ATTRIBUTES_API_VERSION} from '../../../../../actions/userAttributes/constants.js'
import {UserAttributeDefinitionsListCommand} from '../list.js'

const testOrgId = 'test-org'

const defaultMocks = {
  token: 'test-token',
}

const mockDefinitions = [
  {
    createdAt: '2026-01-01T00:00:00Z',
    key: 'location',
    sources: ['sanity'],
    type: 'string',
  },
  {
    createdAt: '2026-01-02T00:00:00Z',
    key: 'year_started',
    sources: ['saml', 'sanity'],
    type: 'integer',
  },
]

const mockResponse = {
  definitions: mockDefinitions,
  hasMore: false,
}

describe('#users:attributes:definitions:list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('lists attribute definitions in table format', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      uri: `/organizations/${testOrgId}/attribute-definitions`,
    }).reply(200, mockResponse)

    const {stdout} = await testCommand(
      UserAttributeDefinitionsListCommand,
      ['--org-id', testOrgId],
      {mocks: defaultMocks},
    )

    expect(stdout).toContain('location')
    expect(stdout).toContain('string')
    expect(stdout).toContain('sanity')
    expect(stdout).toContain('year_started')
    expect(stdout).toContain('integer')
    expect(stdout).toContain('saml, sanity')
  })

  test('outputs JSON when --json flag is provided', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      uri: `/organizations/${testOrgId}/attribute-definitions`,
    }).reply(200, mockResponse)

    const {stdout} = await testCommand(
      UserAttributeDefinitionsListCommand,
      ['--org-id', testOrgId, '--json'],
      {mocks: defaultMocks},
    )

    const parsed = JSON.parse(stdout)
    expect(parsed.definitions).toHaveLength(2)
    expect(parsed.definitions[0].key).toBe('location')
  })

  test('displays a message when no definitions are found', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      uri: `/organizations/${testOrgId}/attribute-definitions`,
    }).reply(200, {definitions: [], hasMore: false})

    const {stdout} = await testCommand(
      UserAttributeDefinitionsListCommand,
      ['--org-id', testOrgId],
      {mocks: defaultMocks},
    )

    expect(stdout).toBe('No attribute definitions found.\n')
  })

  test('handles API error gracefully', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      uri: `/organizations/${testOrgId}/attribute-definitions`,
    }).reply(403, {message: 'Forbidden'})

    const {error} = await testCommand(
      UserAttributeDefinitionsListCommand,
      ['--org-id', testOrgId],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch attribute definitions')
    expect(error?.message).toContain('Forbidden')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles 404 organization not found', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      uri: `/organizations/${testOrgId}/attribute-definitions`,
    }).reply(404, {message: 'Organization not found'})

    const {error} = await testCommand(
      UserAttributeDefinitionsListCommand,
      ['--org-id', testOrgId],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch attribute definitions')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles network error gracefully', async () => {
    const {error} = await testCommand(
      UserAttributeDefinitionsListCommand,
      ['--org-id', testOrgId],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch attribute definitions')
    expect(error?.oclif?.exit).toBe(1)
  })
})

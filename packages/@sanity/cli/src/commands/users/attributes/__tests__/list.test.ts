import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {USER_ATTRIBUTES_API_VERSION} from '../../../../actions/userAttributes/constants.js'
import {UserAttributesListCommand} from '../list.js'

const testOrgId = 'test-org'
const testUserId = 'test-user'

const defaultMocks = {
  token: 'test-token',
}

const mockAttributes = [
  {
    activeSource: 'sanity',
    activeValue: 'UK',
    key: 'location',
    type: 'string',
    values: {saml: 'US', sanity: 'UK'},
  },
  {
    activeSource: 'saml',
    activeValue: 2020,
    key: 'year_started',
    type: 'integer',
    values: {saml: 2020},
  },
]

const mockMeResponse = {
  attributes: mockAttributes,
  organizationId: testOrgId,
  sanityUserId: 'me-user',
}

const mockUserResponse = {
  attributes: mockAttributes,
  organizationId: testOrgId,
  sanityUserId: testUserId,
}

describe('#users:attributes:list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('lists own attributes when no --user-id is provided', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      uri: `/organizations/${testOrgId}/users/me/attributes`,
    }).reply(200, mockMeResponse)

    const {stdout} = await testCommand(UserAttributesListCommand, ['--org-id', testOrgId], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('location')
    expect(stdout).toContain('year_started')
    expect(stdout).toContain('UK')
    expect(stdout).toContain('sanity')
  })

  test('lists a specific user attributes when --user-id is provided', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      uri: `/organizations/${testOrgId}/users/${testUserId}/attributes`,
    }).reply(200, mockUserResponse)

    const {stdout} = await testCommand(
      UserAttributesListCommand,
      ['--org-id', testOrgId, '--user-id', testUserId],
      {mocks: defaultMocks},
    )

    expect(stdout).toContain('location')
    expect(stdout).toContain('UK')
  })

  test('outputs JSON when --json flag is provided', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      uri: `/organizations/${testOrgId}/users/me/attributes`,
    }).reply(200, mockMeResponse)

    const {stdout} = await testCommand(
      UserAttributesListCommand,
      ['--org-id', testOrgId, '--json'],
      {mocks: defaultMocks},
    )

    const parsed = JSON.parse(stdout)
    expect(parsed.sanityUserId).toBe('me-user')
    expect(parsed.attributes).toHaveLength(2)
  })

  test('displays a message when no attributes are found', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      uri: `/organizations/${testOrgId}/users/me/attributes`,
    }).reply(200, {...mockMeResponse, attributes: []})

    const {stdout} = await testCommand(UserAttributesListCommand, ['--org-id', testOrgId], {
      mocks: defaultMocks,
    })

    expect(stdout).toBe('No attributes found.\n')
  })

  test('handles API error gracefully', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      uri: `/organizations/${testOrgId}/users/me/attributes`,
    }).reply(403, {message: 'Forbidden'})

    const {error} = await testCommand(UserAttributesListCommand, ['--org-id', testOrgId], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch attributes')
    expect(error?.message).toContain('Forbidden')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles network error gracefully', async () => {
    const {error} = await testCommand(UserAttributesListCommand, ['--org-id', testOrgId], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to fetch attributes')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('formats array values as JSON', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      uri: `/organizations/${testOrgId}/users/me/attributes`,
    }).reply(200, {
      ...mockMeResponse,
      attributes: [
        {
          activeSource: 'sanity',
          activeValue: ['hr', 'sales'],
          key: 'departments',
          type: 'string-array',
          values: {sanity: ['hr', 'sales']},
        },
      ],
    })

    const {stdout} = await testCommand(UserAttributesListCommand, ['--org-id', testOrgId], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('departments')
    expect(stdout).toContain('["hr","sales"]')
  })
})

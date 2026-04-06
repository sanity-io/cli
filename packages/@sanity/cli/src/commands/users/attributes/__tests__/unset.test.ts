import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {USER_ATTRIBUTES_API_VERSION} from '../../../../actions/userAttributes/constants.js'
import {UserAttributesUnsetCommand} from '../unset.js'

const testOrgId = 'test-org'
const testUserId = 'test-user'

const defaultMocks = {
  token: 'test-token',
}

const mockResponse = {
  attributes: [],
  organizationId: testOrgId,
  sanityUserId: testUserId,
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('#users:attributes:unset', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('removes a single attribute from a user', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'delete',
      uri: `/organizations/${testOrgId}/users/${testUserId}/attributes`,
    }).reply(200, mockResponse)

    const {stdout} = await testCommand(
      UserAttributesUnsetCommand,
      ['--org-id', testOrgId, '--user-id', testUserId, '--key', 'location'],
      {mocks: defaultMocks},
    )

    expect(stdout).toBe(`Attribute removed successfully for user ${testUserId}.\n`)
  })

  test('removes multiple attributes from a user', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'delete',
      uri: `/organizations/${testOrgId}/users/${testUserId}/attributes`,
    }).reply(200, mockResponse)

    const {stdout} = await testCommand(
      UserAttributesUnsetCommand,
      ['--org-id', testOrgId, '--user-id', testUserId, '--key', 'location', '--key', 'dept'],
      {mocks: defaultMocks},
    )

    expect(stdout).toBe(`Attributes removed successfully for user ${testUserId}.\n`)
  })

  test('handles API error gracefully', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'delete',
      uri: `/organizations/${testOrgId}/users/${testUserId}/attributes`,
    }).reply(403, {message: 'Forbidden'})

    const {error} = await testCommand(
      UserAttributesUnsetCommand,
      ['--org-id', testOrgId, '--user-id', testUserId, '--key', 'location'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to remove attributes')
    expect(error?.message).toContain('Forbidden')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles 404 error gracefully', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'delete',
      uri: `/organizations/${testOrgId}/users/${testUserId}/attributes`,
    }).reply(404, {message: 'User or organization not found'})

    const {error} = await testCommand(
      UserAttributesUnsetCommand,
      ['--org-id', testOrgId, '--user-id', testUserId, '--key', 'location'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to remove attributes')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles missing --user-id flag', async () => {
    const {error} = await testCommand(
      UserAttributesUnsetCommand,
      ['--org-id', testOrgId, '--key', 'location'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('user-id')
  })

  test('handles missing --key flag', async () => {
    const {error} = await testCommand(
      UserAttributesUnsetCommand,
      ['--org-id', testOrgId, '--user-id', testUserId],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('key')
  })
})

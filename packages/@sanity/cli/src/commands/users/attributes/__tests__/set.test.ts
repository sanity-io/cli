import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {USER_ATTRIBUTES_API_VERSION} from '../../../../actions/userAttributes/constants.js'
import {UserAttributesSetCommand} from '../set.js'

const testOrgId = 'test-org'
const testUserId = 'test-user'

const defaultMocks = {
  token: 'test-token',
}

const mockResponse = {
  attributes: [
    {
      activeSource: 'sanity',
      activeValue: 'UK',
      key: 'location',
      type: 'string',
      values: {sanity: 'UK'},
    },
  ],
  organizationId: testOrgId,
  sanityUserId: testUserId,
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('#users:attributes:set', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('sets attributes for a user', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'post',
      uri: `/organizations/${testOrgId}/users/${testUserId}/attributes`,
    }).reply(200, mockResponse)

    const {stdout} = await testCommand(
      UserAttributesSetCommand,
      [
        '--org-id',
        testOrgId,
        '--user-id',
        testUserId,
        '--attributes',
        '[{"key":"location","value":"UK"}]',
      ],
      {mocks: defaultMocks},
    )

    expect(stdout).toContain(`Attributes updated successfully for user ${testUserId}`)
    expect(stdout).toContain('location')
    expect(stdout).toContain('UK')
  })

  test('outputs JSON when --json flag is provided', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'post',
      uri: `/organizations/${testOrgId}/users/${testUserId}/attributes`,
    }).reply(200, mockResponse)

    const {stdout} = await testCommand(
      UserAttributesSetCommand,
      [
        '--org-id',
        testOrgId,
        '--user-id',
        testUserId,
        '--attributes',
        '[{"key":"location","value":"UK"}]',
        '--json',
      ],
      {mocks: defaultMocks},
    )

    const parsed = JSON.parse(stdout)
    expect(parsed.sanityUserId).toBe(testUserId)
    expect(parsed.attributes).toHaveLength(1)
    expect(parsed.attributes[0].key).toBe('location')
  })

  test('errors on invalid JSON in --attributes', async () => {
    const {error} = await testCommand(
      UserAttributesSetCommand,
      ['--org-id', testOrgId, '--user-id', testUserId, '--attributes', 'not-json'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('not valid JSON')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('errors when --attributes is not an array', async () => {
    const {error} = await testCommand(
      UserAttributesSetCommand,
      [
        '--org-id',
        testOrgId,
        '--user-id',
        testUserId,
        '--attributes',
        '{"key":"location","value":"UK"}',
      ],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('must be a JSON array')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API error gracefully', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'post',
      uri: `/organizations/${testOrgId}/users/${testUserId}/attributes`,
    }).reply(403, {message: 'Forbidden'})

    const {error} = await testCommand(
      UserAttributesSetCommand,
      [
        '--org-id',
        testOrgId,
        '--user-id',
        testUserId,
        '--attributes',
        '[{"key":"location","value":"UK"}]',
      ],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to set attributes')
    expect(error?.message).toContain('Forbidden')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles missing --user-id flag', async () => {
    const {error} = await testCommand(
      UserAttributesSetCommand,
      ['--org-id', testOrgId, '--attributes', '[{"key":"location","value":"UK"}]'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('user-id')
  })

  test('handles missing --attributes flag', async () => {
    const {error} = await testCommand(
      UserAttributesSetCommand,
      ['--org-id', testOrgId, '--user-id', testUserId],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('attributes')
  })
})

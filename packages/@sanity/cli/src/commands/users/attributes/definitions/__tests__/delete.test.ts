import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {USER_ATTRIBUTES_API_VERSION} from '../../../../../actions/userAttributes/constants.js'
import {UserAttributeDefinitionsDeleteCommand} from '../delete.js'

const testOrgId = 'test-org'

const defaultMocks = {
  token: 'test-token',
}

describe('#users:attributes:definitions:delete', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('deletes an attribute definition successfully', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'delete',
      uri: `/organizations/${testOrgId}/attribute-definitions/location`,
    }).reply(204)

    const {stdout} = await testCommand(
      UserAttributeDefinitionsDeleteCommand,
      ['--org-id', testOrgId, 'location'],
      {mocks: defaultMocks},
    )

    expect(stdout).toBe('Attribute definition "location" deleted successfully.\n')
  })

  test('handles 403 forbidden (SAML source exists)', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'delete',
      uri: `/organizations/${testOrgId}/attribute-definitions/location`,
    }).reply(403, {message: 'Forbidden - attribute has SAML source'})

    const {error} = await testCommand(
      UserAttributeDefinitionsDeleteCommand,
      ['--org-id', testOrgId, 'location'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete attribute definition')
    expect(error?.message).toContain('Forbidden')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles 404 not found', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'delete',
      uri: `/organizations/${testOrgId}/attribute-definitions/nonexistent`,
    }).reply(404, {message: 'Attribute definition not found'})

    const {error} = await testCommand(
      UserAttributeDefinitionsDeleteCommand,
      ['--org-id', testOrgId, 'nonexistent'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete attribute definition')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles 409 conflict (definition in use)', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'delete',
      uri: `/organizations/${testOrgId}/attribute-definitions/location`,
    }).reply(409, {message: 'Conflict - attribute definition is in use by one or more users'})

    const {error} = await testCommand(
      UserAttributeDefinitionsDeleteCommand,
      ['--org-id', testOrgId, 'location'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete attribute definition')
    expect(error?.message).toContain('in use')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles network error gracefully', async () => {
    const {error} = await testCommand(
      UserAttributeDefinitionsDeleteCommand,
      ['--org-id', testOrgId, 'location'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to delete attribute definition')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles missing key argument', async () => {
    const {error} = await testCommand(
      UserAttributeDefinitionsDeleteCommand,
      ['--org-id', testOrgId],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
  })

  test('URL-encodes special characters in key', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'delete',
      uri: `/organizations/${testOrgId}/attribute-definitions/my%20attr`,
    }).reply(204)

    const {stdout} = await testCommand(
      UserAttributeDefinitionsDeleteCommand,
      ['--org-id', testOrgId, 'my attr'],
      {mocks: defaultMocks},
    )

    expect(stdout).toContain('deleted successfully')
  })
})

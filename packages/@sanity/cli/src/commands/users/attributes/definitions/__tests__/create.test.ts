import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {USER_ATTRIBUTES_API_VERSION} from '../../../../../actions/userAttributes/constants.js'
import {UserAttributeDefinitionsCreateCommand} from '../create.js'

const testOrgId = 'test-org'

const defaultMocks = {
  token: 'test-token',
}

describe('#users:attributes:definitions:create', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('creates a string attribute definition', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'post',
      uri: `/organizations/${testOrgId}/attribute-definitions`,
    }).reply(201, {
      createdAt: '2026-01-01T00:00:00Z',
      key: 'location',
      sources: ['sanity'],
      type: 'string',
    })

    const {stdout} = await testCommand(
      UserAttributeDefinitionsCreateCommand,
      ['--org-id', testOrgId, '--key', 'location', '--type', 'string'],
      {mocks: defaultMocks},
    )

    expect(stdout).toContain('Attribute definition "location" created successfully')
    expect(stdout).toContain('string')
  })

  test('reports when definition already exists', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'post',
      uri: `/organizations/${testOrgId}/attribute-definitions`,
    }).reply(200, {
      alreadyExists: true,
      createdAt: '2026-01-01T00:00:00Z',
      key: 'location',
      sources: ['sanity'],
      type: 'string',
    })

    const {stdout} = await testCommand(
      UserAttributeDefinitionsCreateCommand,
      ['--org-id', testOrgId, '--key', 'location', '--type', 'string'],
      {mocks: defaultMocks},
    )

    expect(stdout).toContain('Attribute definition "location" already exists')
  })

  test('outputs JSON when --json flag is provided', async () => {
    const mockDef = {
      createdAt: '2026-01-01T00:00:00Z',
      key: 'location',
      sources: ['sanity'],
      type: 'string',
    }

    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'post',
      uri: `/organizations/${testOrgId}/attribute-definitions`,
    }).reply(201, mockDef)

    const {stdout} = await testCommand(
      UserAttributeDefinitionsCreateCommand,
      ['--org-id', testOrgId, '--key', 'location', '--type', 'string', '--json'],
      {mocks: defaultMocks},
    )

    const parsed = JSON.parse(stdout)
    expect(parsed.key).toBe('location')
    expect(parsed.type).toBe('string')
  })

  test('handles 403 forbidden (SAML definition exists)', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'post',
      uri: `/organizations/${testOrgId}/attribute-definitions`,
    }).reply(403, {message: 'Forbidden'})

    const {error} = await testCommand(
      UserAttributeDefinitionsCreateCommand,
      ['--org-id', testOrgId, '--key', 'location', '--type', 'string'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to create attribute definition')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles 409 conflict (type mismatch)', async () => {
    mockApi({
      apiVersion: USER_ATTRIBUTES_API_VERSION,
      method: 'post',
      uri: `/organizations/${testOrgId}/attribute-definitions`,
    }).reply(409, {message: 'Conflict - attribute definition exists with different type'})

    const {error} = await testCommand(
      UserAttributeDefinitionsCreateCommand,
      ['--org-id', testOrgId, '--key', 'location', '--type', 'integer'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Failed to create attribute definition')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles missing --key flag', async () => {
    const {error} = await testCommand(
      UserAttributeDefinitionsCreateCommand,
      ['--org-id', testOrgId, '--type', 'string'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('key')
  })

  test('handles missing --type flag', async () => {
    const {error} = await testCommand(
      UserAttributeDefinitionsCreateCommand,
      ['--org-id', testOrgId, '--key', 'location'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('type')
  })

  test('handles invalid --type value', async () => {
    const {error} = await testCommand(
      UserAttributeDefinitionsCreateCommand,
      ['--org-id', testOrgId, '--key', 'location', '--type', 'invalid-type'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
  })
})

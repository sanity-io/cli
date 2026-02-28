import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {TOKENS_API_VERSION} from '../../../actions/tokens/constants.js'
import {TokensListCommand} from '../list.js'

const testProjectId = 'test-project'

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

const mockTokens = [
  {
    createdAt: '2023-01-01T00:00:00Z',
    createdBy: 'user@example.com',
    id: 'token-1',
    label: 'Production API',
    lastUsedAt: '2023-12-01T00:00:00Z',
    permissions: ['read', 'write'],
    projectId: testProjectId,
    projectUserId: 'user-1',
    roles: [
      {name: 'admin', title: 'Administrator'},
      {name: 'editor', title: 'Editor'},
    ],
  },
  {
    createdAt: '2023-02-01T00:00:00Z',
    createdBy: 'dev@example.com',
    id: 'token-2',
    label: 'Development API',
    lastUsedAt: null,
    permissions: ['read'],
    projectId: testProjectId,
    projectUserId: 'user-2',
    roles: [{name: 'viewer', title: 'Viewer'}],
  },
  {
    createdAt: '2023-03-01T00:00:00Z',
    createdBy: 'analytics@example.com',
    id: 'token-3',
    label: 'Analytics Token',
    lastUsedAt: '2023-11-15T00:00:00Z',
    permissions: ['read'],
    projectId: testProjectId,
    projectUserId: 'user-3',
    roles: [],
  },
]

describe('#tokens:list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('displays tokens in table format by default', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/projects/${testProjectId}/tokens`,
    }).reply(200, mockTokens)

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Found 3 API tokens')
    expect(stdout).toContain('Label')
    expect(stdout).toContain('Token ID')
    expect(stdout).toContain('Roles')
    expect(stdout).toContain('Production API')
    expect(stdout).toContain('token-1')
    expect(stdout).toContain('Administrator, Editor')
    expect(stdout).toContain('Development API')
    expect(stdout).toContain('token-2')
    expect(stdout).toContain('Viewer')
    expect(stdout).toContain('Analytics Token')
    expect(stdout).toContain('token-3')
    expect(stdout).toContain('No roles')
  })

  test('displays tokens in JSON format when requested', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/projects/${testProjectId}/tokens`,
    }).reply(200, mockTokens)

    const {stdout} = await testCommand(TokensListCommand, ['--json'], {mocks: defaultMocks})

    const parsed = JSON.parse(stdout)
    expect(parsed).toHaveLength(3)
    expect(parsed[0]).toMatchObject({
      createdBy: 'user@example.com',
      id: 'token-1',
      label: 'Production API',
      roles: [
        {name: 'admin', title: 'Administrator'},
        {name: 'editor', title: 'Editor'},
      ],
    })
  })

  test('handles empty tokens list', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/projects/${testProjectId}/tokens`,
    }).reply(200, [])

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toBe('No API tokens found for this project.\n')
  })

  test('displays an error if the API request fails', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/projects/${testProjectId}/tokens`,
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token list retrieval failed')
    expect(error?.message).toContain('Internal Server Error')
  })

  test('handles network errors gracefully', async () => {
    // Don't set up any mock to simulate network failure
    const {error} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token list retrieval failed')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no project ID is found', async () => {
    const {error} = await testCommand(TokensListCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when project ID is null', async () => {
    const {error} = await testCommand(TokensListCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when project ID is empty string', async () => {
    const {error} = await testCommand(TokensListCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: ''}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
  })

  test('handles 404 error gracefully', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/projects/${testProjectId}/tokens`,
    }).reply(404, {message: 'Project not found'})

    const {error} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token list retrieval failed')
    expect(error?.message).toContain('Project not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles 403 forbidden error', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/projects/${testProjectId}/tokens`,
    }).reply(403, {message: 'Forbidden'})

    const {error} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token list retrieval failed')
    expect(error?.message).toContain('Forbidden')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('displays single token correctly', async () => {
    const singleToken = [mockTokens[0]]

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/projects/${testProjectId}/tokens`,
    }).reply(200, singleToken)

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Found 1 API tokens')
    expect(stdout).toContain('Production API')
    expect(stdout).toContain('token-1')
    expect(stdout).toContain('Administrator, Editor')
  })

  test('handles tokens with special characters in labels', async () => {
    const specialTokens = [
      {
        createdAt: '2023-01-01T00:00:00Z',
        createdBy: 'user@café.com',
        id: 'token-special',
        label: 'API Token (Test & Dev)',
        lastUsedAt: null,
        permissions: ['read'],
        projectId: testProjectId,
        projectUserId: 'user-special',
        roles: [{name: 'viewer', title: 'Viewer'}],
      },
    ]

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/projects/${testProjectId}/tokens`,
    }).reply(200, specialTokens)

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('API Token (Test & Dev)')
    expect(stdout).toContain('token-special')
    expect(stdout).toContain('Viewer')
  })

  test('truncates long labels correctly', async () => {
    const longLabelTokens = [
      {
        createdAt: '2023-01-01T00:00:00Z',
        createdBy: 'user@example.com',
        id: 'token-long',
        label:
          'This is a very long token label that should be truncated because it exceeds the maximum length',
        lastUsedAt: null,
        permissions: ['read'],
        projectId: testProjectId,
        projectUserId: 'user-long',
        roles: [{name: 'viewer', title: 'Viewer'}],
      },
    ]

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/projects/${testProjectId}/tokens`,
    }).reply(200, longLabelTokens)

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('This is a very long token label that ...')
    expect(stdout).not.toContain('because it exceeds the maximum length')
  })

  test('truncates long roles correctly', async () => {
    const longRolesTokens = [
      {
        createdAt: '2023-01-01T00:00:00Z',
        createdBy: 'user@example.com',
        id: 'token-roles',
        label: 'Multi Role Token',
        lastUsedAt: null,
        permissions: ['read'],
        projectId: testProjectId,
        projectUserId: 'user-roles',
        roles: [
          {name: 'administrator', title: 'Administrator'},
          {name: 'editor', title: 'Editor'},
          {name: 'viewer', title: 'Viewer'},
          {name: 'contributor', title: 'Contributor'},
        ],
      },
    ]

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/projects/${testProjectId}/tokens`,
    }).reply(200, longRolesTokens)

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Multi Role Token')
    expect(stdout).toContain('Administrator, Editor, View...')
  })
})

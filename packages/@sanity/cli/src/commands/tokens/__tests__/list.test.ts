import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
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

const mockRoles = [
  {
    appliesToRobots: true,
    appliesToUsers: true,
    description: 'Administer the project',
    isCustom: false,
    name: 'administrator',
    title: 'Administrator',
  },
  {
    appliesToRobots: true,
    appliesToUsers: true,
    description: 'Can read and write documents',
    isCustom: false,
    name: 'editor',
    title: 'Editor',
  },
  {
    appliesToRobots: true,
    appliesToUsers: true,
    description: 'Can read documents',
    isCustom: false,
    name: 'viewer',
    title: 'Viewer',
  },
]

const createRobot = (overrides: Record<string, unknown> = {}) => ({
  createdAt: '2023-01-01T00:00:00.000Z',
  expiresAt: null,
  id: 'g-robot-1',
  label: 'Test Robot',
  managedBy: {resourceId: testProjectId, resourceType: 'project'},
  memberships: [
    {
      addedAt: '2023-01-01T00:00:00.000Z',
      resourceId: testProjectId,
      resourceType: 'project',
      roleNames: ['viewer'],
    },
  ],
  tokenId: 'si-token-1',
  ...overrides,
})

const mockRobots = [
  createRobot({
    createdAt: '2023-01-01T00:00:00.000Z',
    expiresAt: '2099-12-31T00:00:00.000Z',
    id: 'g-robot-1',
    label: 'Production API',
    memberships: [
      {
        addedAt: '2023-01-01T00:00:00.000Z',
        resourceId: testProjectId,
        resourceType: 'project',
        roleNames: ['administrator', 'editor'],
      },
    ],
    tokenId: 'si-token-1',
  }),
  createRobot({
    createdAt: '2023-02-01T00:00:00.000Z',
    id: 'g-robot-2',
    label: 'Development API',
    tokenId: 'si-token-2',
  }),
  createRobot({
    createdAt: '2023-03-01T00:00:00.000Z',
    id: 'g-robot-3',
    label: 'Analytics Token',
    memberships: [
      {
        addedAt: '2023-03-01T00:00:00.000Z',
        resourceId: testProjectId,
        resourceType: 'project',
        roleNames: [],
      },
    ],
    tokenId: 'si-token-3',
  }),
]

const mockRobotsApi = () =>
  mockApi({
    apiVersion: TOKENS_API_VERSION,
    query: {includeChildren: 'false'},
    uri: `/access/project/${testProjectId}/robots`,
  })

const mockRolesApi = () =>
  mockApi({
    apiVersion: TOKENS_API_VERSION,
    query: {includeChildren: 'false', limit: '500'},
    uri: `/access/project/${testProjectId}/roles`,
  })

const mockListApis = (robots: unknown[] = mockRobots, roles: unknown[] = mockRoles) => {
  mockRobotsApi().reply(200, {data: robots, nextCursor: null})
  mockRolesApi().reply(200, {data: roles, nextCursor: null})
}

describe('#tokens:list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('displays tokens in table format by default', async () => {
    mockListApis()

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Found 3 API tokens')
    expect(stdout).toContain('Label')
    expect(stdout).toContain('Token ID')
    expect(stdout).toContain('Roles')
    expect(stdout).toContain('Expires')
    expect(stdout).toContain('Production API')
    expect(stdout).toContain('g-robot-1')
    expect(stdout).toContain('Administrator, Editor')
    expect(stdout).toContain('2099-12-31')
    expect(stdout).toContain('Development API')
    expect(stdout).toContain('g-robot-2')
    expect(stdout).toContain('Viewer')
    expect(stdout).toContain('Never')
    expect(stdout).toContain('Analytics Token')
    expect(stdout).toContain('g-robot-3')
    expect(stdout).toContain('No roles')
  })

  test('excludes robots managed by other resources', async () => {
    const orgManagedRobot = createRobot({
      id: 'g-org-robot',
      label: 'Org Managed Robot',
      managedBy: {resourceId: 'some-org', resourceType: 'organization'},
    })

    mockListApis([mockRobots[0], orgManagedRobot])

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Found 1 API tokens')
    expect(stdout).toContain('Production API')
    expect(stdout).not.toContain('Org Managed Robot')
  })

  test('follows pagination cursors when listing robots', async () => {
    mockRobotsApi().reply(200, {data: [mockRobots[0]], nextCursor: 'cursor-1'})
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      query: {includeChildren: 'false', nextCursor: 'cursor-1'},
      uri: `/access/project/${testProjectId}/robots`,
    }).reply(200, {data: [mockRobots[1]], nextCursor: null})
    mockRolesApi().reply(200, {data: mockRoles, nextCursor: null})

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Found 2 API tokens')
    expect(stdout).toContain('Production API')
    expect(stdout).toContain('Development API')
  })

  test('displays tokens in JSON format when requested', async () => {
    mockListApis()

    const {stdout} = await testCommand(TokensListCommand, ['--json'], {mocks: defaultMocks})

    const parsed = JSON.parse(stdout)
    expect(parsed).toHaveLength(3)
    expect(parsed[0]).toEqual({
      createdAt: '2023-01-01T00:00:00.000Z',
      expiresAt: '2099-12-31T00:00:00.000Z',
      id: 'g-robot-1',
      label: 'Production API',
      roles: [
        {name: 'administrator', title: 'Administrator'},
        {name: 'editor', title: 'Editor'},
      ],
      tokenId: 'si-token-1',
    })
  })

  test('handles empty tokens list', async () => {
    // The roles endpoint is not queried when there are no tokens to resolve
    mockRobotsApi().reply(200, {data: [], nextCursor: null})

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toBe('No API tokens found for this project.\n')
  })

  test('displays an error if the API request fails', async () => {
    mockRobotsApi().reply(500, {message: 'Internal Server Error'})

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
    mockRobotsApi().reply(404, {message: 'Project not found'})

    const {error} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token list retrieval failed')
    expect(error?.message).toContain('Project not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles 403 forbidden error', async () => {
    mockRobotsApi().reply(403, {message: 'Forbidden'})

    const {error} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token list retrieval failed')
    expect(error?.message).toContain('Forbidden')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('displays single token correctly', async () => {
    mockListApis([mockRobots[0]])

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Found 1 API tokens')
    expect(stdout).toContain('Production API')
    expect(stdout).toContain('g-robot-1')
    expect(stdout).toContain('Administrator, Editor')
  })

  test('falls back to role names when a role title is unknown', async () => {
    const customRoleRobot = createRobot({
      id: 'g-robot-custom',
      label: 'Custom Role Token',
      memberships: [
        {
          addedAt: '2023-01-01T00:00:00.000Z',
          resourceId: testProjectId,
          resourceType: 'project',
          roleNames: ['my-custom-role'],
        },
      ],
    })

    mockListApis([customRoleRobot], [])

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Custom Role Token')
    expect(stdout).toContain('my-custom-role')
  })

  test('lists tokens with role names when the roles cannot be fetched', async () => {
    mockRobotsApi().reply(200, {data: [mockRobots[1]], nextCursor: null})
    mockRolesApi().reply(403, {message: 'Forbidden'})

    const {error, stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(error).toBeUndefined()
    expect(stdout).toContain('Development API')
    expect(stdout).toContain('viewer')
  })

  test('handles tokens with special characters in labels', async () => {
    mockListApis([
      createRobot({
        id: 'g-robot-special',
        label: 'API Token (Test & Dev)',
      }),
    ])

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('API Token (Test & Dev)')
    expect(stdout).toContain('g-robot-special')
    expect(stdout).toContain('Viewer')
  })

  test('truncates long labels correctly', async () => {
    mockListApis([
      createRobot({
        id: 'g-robot-long',
        label:
          'This is a very long token label that should be truncated because it exceeds the maximum length',
      }),
    ])

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('This is a very long token label that ...')
    expect(stdout).not.toContain('because it exceeds the maximum length')
  })

  test('truncates long roles correctly', async () => {
    mockListApis([
      createRobot({
        id: 'g-robot-roles',
        label: 'Multi Role Token',
        memberships: [
          {
            addedAt: '2023-01-01T00:00:00.000Z',
            resourceId: testProjectId,
            resourceType: 'project',
            roleNames: ['administrator', 'editor', 'viewer', 'contributor'],
          },
        ],
      }),
    ])

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Multi Role Token')
    expect(stdout).toContain('Administrator, Editor, View...')
  })
})

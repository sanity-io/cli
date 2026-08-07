import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import stringWidth from 'string-width'
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

const mockRobots = [
  {
    createdAt: '2023-01-01T00:00:00Z',
    expiresAt: '2030-06-15T00:00:00Z',
    id: 'robot-1',
    label: 'Production API',
    memberships: [
      {
        lastSeenAt: '2023-12-01T00:00:00Z',
        resourceId: testProjectId,
        resourceType: 'project',
        resourceUserId: 'user-1',
        roleNames: ['admin', 'editor'],
      },
    ],
    tokenId: 'robot-1-active-token',
  },
  {
    createdAt: '2023-02-01T00:00:00Z',
    id: 'robot-2',
    label: 'Development API',
    memberships: [
      {
        lastSeenAt: null,
        resourceId: testProjectId,
        resourceType: 'project',
        resourceUserId: 'user-2',
        roleNames: ['viewer'],
      },
    ],
    tokenId: 'robot-2-active-token',
  },
  {
    createdAt: '2023-03-01T00:00:00Z',
    id: 'robot-3',
    label: 'Analytics Token',
    memberships: [
      {
        lastSeenAt: '2023-11-15T00:00:00Z',
        resourceId: testProjectId,
        resourceType: 'project',
        resourceUserId: 'user-3',
        roleNames: [],
      },
    ],
    tokenId: 'robot-3-active-token',
  },
]

function robotsPage(robots: unknown[]) {
  return {data: robots, nextCursor: null}
}

describe('#tokens:list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    Reflect.deleteProperty(process.stdout, 'columns')
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('displays tokens in table format by default', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/access/project/${testProjectId}/robots`,
    }).reply(200, robotsPage(mockRobots))

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Found 3 API tokens')
    expect(stdout).toContain('Label')
    expect(stdout).toContain('ID')
    expect(stdout).toContain('Roles')
    expect(stdout).toContain('Expires')
    expect(stdout).toContain('Production API')
    expect(stdout).toContain('robot-1')
    expect(stdout).toContain('admin, editor')
    expect(stdout).toContain('2030-06-15')
    expect(stdout).toContain('Development API')
    expect(stdout).toContain('robot-2')
    expect(stdout).toContain('viewer')
    expect(stdout).toContain('Analytics Token')
    expect(stdout).toContain('robot-3')
    expect(stdout).toContain('No roles')
    expect(stdout).toContain('Never')
  })

  test('displays robots as JSON when requested', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/access/project/${testProjectId}/robots`,
    }).reply(200, robotsPage(mockRobots))

    const {stdout} = await testCommand(TokensListCommand, ['--json'], {mocks: defaultMocks})

    const parsed = JSON.parse(stdout)
    expect(parsed).toEqual(mockRobots)
  })

  test('excludes robots managed by an organization', async () => {
    const orgManagedRobot = {
      createdAt: '2023-04-01T00:00:00Z',
      id: 'robot-org',
      label: 'Org Managed Token',
      managedBy: {resourceId: 'org-1', resourceType: 'organization'},
      memberships: [
        {
          resourceId: testProjectId,
          resourceType: 'project',
          roleNames: ['viewer'],
        },
      ],
      tokenId: 'robot-org-active-token',
    }
    const projectManagedRobot = {
      ...mockRobots[0],
      managedBy: {resourceId: testProjectId, resourceType: 'project'},
    }

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/access/project/${testProjectId}/robots`,
    }).reply(200, robotsPage([orgManagedRobot, projectManagedRobot, mockRobots[1]]))

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Found 2 API tokens')
    expect(stdout).toContain('Production API')
    expect(stdout).toContain('Development API')
    expect(stdout).not.toContain('Org Managed Token')
  })

  test('handles empty tokens list', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/access/project/${testProjectId}/robots`,
    }).reply(200, robotsPage([]))

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toBe('No API tokens found for this project.\n')
  })

  test('displays an error if the API request fails', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/access/project/${testProjectId}/robots`,
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
      uri: `/access/project/${testProjectId}/robots`,
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
      uri: `/access/project/${testProjectId}/robots`,
    }).reply(403, {message: 'Forbidden'})

    const {error} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token list retrieval failed')
    expect(error?.message).toContain('Forbidden')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('displays single token correctly', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/access/project/${testProjectId}/robots`,
    }).reply(200, robotsPage([mockRobots[0]]))

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Found 1 API tokens')
    expect(stdout).toContain('Production API')
    expect(stdout).toContain('robot-1')
    expect(stdout).toContain('admin, editor')
  })

  test('handles tokens with special characters in labels', async () => {
    const specialRobot = {
      createdAt: '2023-01-01T00:00:00Z',
      id: 'robot-special',
      label: 'API Token (Test & Dev)',
      memberships: [
        {
          resourceId: testProjectId,
          resourceType: 'project',
          resourceUserId: 'user-special',
          roleNames: ['viewer'],
        },
      ],
      tokenId: 'robot-special-active-token',
    }

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/access/project/${testProjectId}/robots`,
    }).reply(200, robotsPage([specialRobot]))

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('API Token (Test & Dev)')
    expect(stdout).toContain('robot-special')
    expect(stdout).toContain('viewer')
  })

  test('wraps long labels without truncating them', async () => {
    Object.defineProperty(process.stdout, 'columns', {configurable: true, value: 60})
    const longLabelRobot = {
      createdAt: '2023-01-01T00:00:00Z',
      id: 'robot-long',
      label:
        'This is a very long token label that should be wrapped because it exceeds the maximum length',
      memberships: [
        {
          resourceId: testProjectId,
          resourceType: 'project',
          resourceUserId: 'user-long',
          roleNames: ['viewer'],
        },
      ],
      tokenId: 'robot-long-active-token',
    }

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/access/project/${testProjectId}/robots`,
    }).reply(200, robotsPage([longLabelRobot]))

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('This is a very')
    expect(stdout).toContain('maximum')
    expect(stdout).toContain('length')
    expect(stdout).not.toContain('...')
    for (const line of stdout.trim().split('\n')) {
      expect(stringWidth(line)).toBeLessThanOrEqual(60)
    }
  })

  test('wraps long roles without truncating them', async () => {
    Object.defineProperty(process.stdout, 'columns', {configurable: true, value: 60})
    const longRolesRobot = {
      createdAt: '2023-01-01T00:00:00Z',
      id: 'robot-roles',
      label: 'Multi Role Token',
      memberships: [
        {
          resourceId: testProjectId,
          resourceType: 'project',
          resourceUserId: 'user-roles',
          roleNames: ['administrator', 'editor', 'viewer', 'contributor'],
        },
      ],
      tokenId: 'robot-roles-active-token',
    }

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: `/access/project/${testProjectId}/robots`,
    }).reply(200, robotsPage([longRolesRobot]))

    const {stdout} = await testCommand(TokensListCommand, [], {mocks: defaultMocks})

    expect(stdout).toContain('Multi Role')
    expect(stdout).toContain('Token')
    expect(stdout).toContain('administrator')
    expect(stdout).toContain('editor')
    expect(stdout).toContain('viewer')
    expect(stdout).toContain('contributor')
    expect(stdout).not.toContain('...')
  })
})

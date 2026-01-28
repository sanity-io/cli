import {input, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {PROJECTS_API_VERSION} from '../../../services/projects.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {UsersInviteCommand} from '../invite.js'

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: vi.fn(),
    select: vi.fn(),
  }
})

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
    appliesToRobots: false,
    appliesToUsers: true,
    description: 'Full access to project',
    grants: {},
    isCustom: false,
    name: 'administrator',
    projectId: testProjectId,
    title: 'Administrator',
  },
  {
    appliesToRobots: false,
    appliesToUsers: true,
    description: 'Can edit content and publish',
    grants: {},
    isCustom: false,
    name: 'developer',
    projectId: testProjectId,
    title: 'Developer',
  },
  {
    appliesToRobots: false,
    appliesToUsers: true,
    description: 'Read-only access',
    grants: {},
    isCustom: false,
    name: 'viewer',
    projectId: testProjectId,
    title: 'Viewer',
  },
  {
    appliesToRobots: true,
    appliesToUsers: false,
    description: 'For API tokens',
    grants: {},
    isCustom: false,
    name: 'robot',
    projectId: testProjectId,
    title: 'Robot',
  },
]

describe('#invite', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('invites user with email and role provided via flags', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/projects/${testProjectId}/roles`,
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      method: 'post',
      uri: `/invitations/project/${testProjectId}`,
    }).reply(200, {})

    const {stdout} = await testCommand(
      UsersInviteCommand,
      ['test@example.com', '--role', 'developer'],
      {mocks: defaultMocks},
    )

    expect(stdout).toContain('Invitation sent to test@example.com')
  })

  test('invites user with email provided via args and role as flag', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/projects/${testProjectId}/roles`,
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      method: 'post',
      uri: `/invitations/project/${testProjectId}`,
    }).reply(200, {})

    const {stdout} = await testCommand(
      UsersInviteCommand,
      ['user@example.com', '--role', 'administrator'],
      {mocks: defaultMocks},
    )

    expect(stdout).toContain('Invitation sent to user@example.com')
  })

  test('exits when role is not found', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/projects/${testProjectId}/roles`,
    }).reply(200, mockRoles)

    const {error} = await testCommand(
      UsersInviteCommand,
      ['test@example.com', '--role', 'invalid-role'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Role name "invalid-role" not found')
    expect(error?.message).toContain('Available roles:')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('exits when project ID is not found', async () => {
    const {error} = await testCommand(
      UsersInviteCommand,
      ['test@example.com', '--role', 'developer'],
      {
        mocks: {
          ...defaultMocks,
          cliConfig: {api: {projectId: undefined}},
        },
      },
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles 402 quota error', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/projects/${testProjectId}/roles`,
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      method: 'post',
      uri: `/invitations/project/${testProjectId}`,
    }).reply(402, {message: 'Payment required'})

    const {error} = await testCommand(
      UsersInviteCommand,
      ['test@example.com', '--role', 'developer'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain(
      'Project is already at user quota, add billing details to the project in order to allow overage charges.',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API errors during invitation', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/projects/${testProjectId}/roles`,
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      method: 'post',
      uri: `/invitations/project/${testProjectId}`,
    }).reply(500, {message: 'Internal server error'})

    const {error} = await testCommand(
      UsersInviteCommand,
      ['test@example.com', '--role', 'developer'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Error inviting user')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API errors when fetching roles', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/projects/${testProjectId}/roles`,
    }).reply(500, {message: 'Internal server error'})

    const {error} = await testCommand(
      UsersInviteCommand,
      ['test@example.com', '--role', 'developer'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Error fetching roles')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('exits when trying to assign role that does not apply to users', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/projects/${testProjectId}/roles`,
    }).reply(200, mockRoles)

    const {error} = await testCommand(
      UsersInviteCommand,
      [
        'test@example.com',
        '--role',
        'robot', // This role does not apply to users
      ],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Role name "robot" not found')
    expect(error?.message).toContain('Available roles:')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('role names are case insensitive', async () => {
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/projects/${testProjectId}/roles`,
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      method: 'post',
      uri: `/invitations/project/${testProjectId}`,
    }).reply(200, {})

    const {stdout} = await testCommand(
      UsersInviteCommand,
      [
        'test@example.com',
        '--role',
        'DEVELOPER', // Uppercase should work
      ],
      {mocks: defaultMocks},
    )

    expect(stdout).toContain('Invitation sent to test@example.com')
  })

  test('prompts for email when not provided as argument', async () => {
    vi.mocked(input).mockResolvedValueOnce('prompted@example.com')

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/projects/${testProjectId}/roles`,
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      method: 'post',
      uri: `/invitations/project/${testProjectId}`,
    }).reply(200, {})

    const {stdout} = await testCommand(UsersInviteCommand, ['--role', 'developer'], {
      mocks: defaultMocks,
    })

    expect(input).toHaveBeenCalledWith({
      message: 'Email to invite:',
      transformer: expect.any(Function),
      validate: expect.any(Function),
    })
    expect(stdout).toContain('Invitation sent to prompted@example.com')
  })

  test('prompts for role when not provided as flag', async () => {
    vi.mocked(select).mockResolvedValueOnce('administrator')

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/projects/${testProjectId}/roles`,
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      method: 'post',
      uri: `/invitations/project/${testProjectId}`,
    }).reply(200, {})

    const {stdout} = await testCommand(UsersInviteCommand, ['prompted@example.com'], {
      mocks: defaultMocks,
    })

    expect(select).toHaveBeenCalledWith({
      choices: [
        {
          name: 'Administrator (Full access to project)',
          value: 'administrator',
        },
        {
          name: 'Developer (Can edit content and publish)',
          value: 'developer',
        },
        {
          name: 'Viewer (Read-only access)',
          value: 'viewer',
        },
      ],
      message: 'Which role should the user have?',
    })
    expect(stdout).toContain('Invitation sent to prompted@example.com')
  })

  test('prompts for both email and role when neither is provided', async () => {
    vi.mocked(input).mockResolvedValueOnce('interactive@example.com')
    vi.mocked(select).mockResolvedValueOnce('viewer')

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      uri: `/projects/${testProjectId}/roles`,
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      method: 'post',
      uri: `/invitations/project/${testProjectId}`,
    }).reply(200, {})

    const {stdout} = await testCommand(UsersInviteCommand, [], {mocks: defaultMocks})

    expect(input).toHaveBeenCalledWith({
      message: 'Email to invite:',
      transformer: expect.any(Function),
      validate: expect.any(Function),
    })
    expect(select).toHaveBeenCalledWith({
      choices: [
        {
          name: 'Administrator (Full access to project)',
          value: 'administrator',
        },
        {
          name: 'Developer (Can edit content and publish)',
          value: 'developer',
        },
        {
          name: 'Viewer (Read-only access)',
          value: 'viewer',
        },
      ],
      message: 'Which role should the user have?',
    })
    expect(stdout).toContain('Invitation sent to interactive@example.com')
  })
})

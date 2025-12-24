import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {input, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {USERS_API_VERSION} from '../../../actions/users/apiVersion.js'
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

vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', async () => {
  return {
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: '/test/path',
      root: '/test/path',
      type: 'studio',
    }),
  }
})

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', async () => {
  return {
    getCliConfig: vi.fn().mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    }),
  }
})

const mockRoles = [
  {
    appliesToRobots: false,
    appliesToUsers: true,
    description: 'Full access to project',
    grants: {},
    isCustom: false,
    name: 'administrator',
    projectId: 'test-project',
    title: 'Administrator',
  },
  {
    appliesToRobots: false,
    appliesToUsers: true,
    description: 'Can edit content and publish',
    grants: {},
    isCustom: false,
    name: 'developer',
    projectId: 'test-project',
    title: 'Developer',
  },
  {
    appliesToRobots: false,
    appliesToUsers: true,
    description: 'Read-only access',
    grants: {},
    isCustom: false,
    name: 'viewer',
    projectId: 'test-project',
    title: 'Viewer',
  },
  {
    appliesToRobots: true,
    appliesToUsers: false,
    description: 'For API tokens',
    grants: {},
    isCustom: false,
    name: 'robot',
    projectId: 'test-project',
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

  test('--help works', async () => {
    const {stdout} = await runCommand(['users invite', '--help'])

    expect(stdout).toContain('Invite a new user to the project')
    expect(stdout).toContain('--role')
  })

  test('invites user with email and role provided via flags', async () => {
    mockApi({
      apiVersion: USERS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: USERS_API_VERSION,
      method: 'post',
      uri: '/invitations/project/test-project',
    }).reply(200, {})

    const {stdout} = await testCommand(UsersInviteCommand, [
      'test@example.com',
      '--role',
      'developer',
    ])

    expect(stdout).toContain('Invitation sent to test@example.com')
  })

  test('invites user with email provided via args and role as flag', async () => {
    mockApi({
      apiVersion: USERS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: USERS_API_VERSION,
      method: 'post',
      uri: '/invitations/project/test-project',
    }).reply(200, {})

    const {stdout} = await testCommand(UsersInviteCommand, [
      'user@example.com',
      '--role',
      'administrator',
    ])

    expect(stdout).toContain('Invitation sent to user@example.com')
  })

  test('exits when role is not found', async () => {
    mockApi({
      apiVersion: USERS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    const {error} = await testCommand(UsersInviteCommand, [
      'test@example.com',
      '--role',
      'invalid-role',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Role name "invalid-role" not found')
    expect(error?.message).toContain('Available roles:')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('exits when project ID is not found', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {
        projectId: undefined,
      },
    })

    const {error} = await testCommand(UsersInviteCommand, [
      'test@example.com',
      '--role',
      'developer',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles 402 quota error', async () => {
    mockApi({
      apiVersion: USERS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: USERS_API_VERSION,
      method: 'post',
      uri: '/invitations/project/test-project',
    }).reply(402, {message: 'Payment required'})

    const {error} = await testCommand(UsersInviteCommand, [
      'test@example.com',
      '--role',
      'developer',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain(
      'Project is already at user quota, add billing details to the project in order to allow overage charges.',
    )
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API errors during invitation', async () => {
    mockApi({
      apiVersion: USERS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: USERS_API_VERSION,
      method: 'post',
      uri: '/invitations/project/test-project',
    }).reply(500, {message: 'Internal server error'})

    const {error} = await testCommand(UsersInviteCommand, [
      'test@example.com',
      '--role',
      'developer',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Error inviting user')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API errors when fetching roles', async () => {
    mockApi({
      apiVersion: USERS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(500, {message: 'Internal server error'})

    const {error} = await testCommand(UsersInviteCommand, [
      'test@example.com',
      '--role',
      'developer',
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Error fetching roles')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('exits when trying to assign role that does not apply to users', async () => {
    mockApi({
      apiVersion: USERS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    const {error} = await testCommand(UsersInviteCommand, [
      'test@example.com',
      '--role',
      'robot', // This role does not apply to users
    ])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Role name "robot" not found')
    expect(error?.message).toContain('Available roles:')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('role names are case insensitive', async () => {
    mockApi({
      apiVersion: USERS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: USERS_API_VERSION,
      method: 'post',
      uri: '/invitations/project/test-project',
    }).reply(200, {})

    const {stdout} = await testCommand(UsersInviteCommand, [
      'test@example.com',
      '--role',
      'DEVELOPER', // Uppercase should work
    ])

    expect(stdout).toContain('Invitation sent to test@example.com')
  })

  test('prompts for email when not provided as argument', async () => {
    vi.mocked(input).mockResolvedValueOnce('prompted@example.com')

    mockApi({
      apiVersion: USERS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: USERS_API_VERSION,
      method: 'post',
      uri: '/invitations/project/test-project',
    }).reply(200, {})

    const {stdout} = await testCommand(UsersInviteCommand, ['--role', 'developer'])

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
      apiVersion: USERS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: USERS_API_VERSION,
      method: 'post',
      uri: '/invitations/project/test-project',
    }).reply(200, {})

    const {stdout} = await testCommand(UsersInviteCommand, ['prompted@example.com'])

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
      apiVersion: USERS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: USERS_API_VERSION,
      method: 'post',
      uri: '/invitations/project/test-project',
    }).reply(200, {})

    const {stdout} = await testCommand(UsersInviteCommand, [])

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

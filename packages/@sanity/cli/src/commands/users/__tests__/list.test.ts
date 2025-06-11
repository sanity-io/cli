import {runCommand} from '@oclif/test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {mockApi} from '~test/helpers/mockApi.js'
import {testCommand} from '~test/helpers/testCommand.js'

import {LIST_USERS_API_VERSION} from '../../../actions/users/apiVersion.js'
import {getCliConfig} from '../../../config/cli/getCliConfig.js'
import {List} from '../list.js'

vi.mock(import('../../../config/findProjectRoot.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: '/test/path',
      root: '/test/path',
      type: 'studio',
    }),
  }
})

vi.mock(import('../../../config/cli/getCliConfig.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getCliConfig: vi.fn().mockResolvedValue({
      api: {
        projectId: 'test-project',
      },
    }),
  }
})

describe('#list', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['users list', '--help'])

    expect(stdout).toContain('List all users of the project')
  })

  test('displays users correctly', async () => {
    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      query: {includeFeatures: 'false'},
      uri: '/projects/test-project',
    }).reply(200, {
      members: [
        {id: 'user1', isRobot: false, role: 'developer'},
        {id: 'user2', isRobot: false, role: 'admin'},
      ],
    })
    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      uri: '/invitations/project/test-project',
    }).reply(200, [])

    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      uri: '/users/user1,user2',
    }).reply(200, [
      {createdAt: '2023-01-01', displayName: 'User One', id: 'user1'},
      {createdAt: '2023-01-02', displayName: 'User Two', id: 'user2'},
    ])

    const {stdout} = await testCommand(List)

    expect(stdout).toMatchSnapshot()
  })

  test('displays pending invitations correctly', async () => {
    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      query: {includeFeatures: 'false'},
      uri: '/projects/test-project',
    }).reply(200, {
      members: [
        {id: 'user1', isRobot: false, role: 'developer'},
        {id: 'user2', isRobot: false, role: 'admin'},
      ],
    })
    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      uri: '/invitations/project/test-project',
    }).reply(200, [
      {
        createdAt: '2023-02-01',
        email: 'pending@example.com',
        id: 'invite1',
        invitedByUser: {id: 'user2'},
        role: 'viewer',
      },
    ])
    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      uri: '/users/user1,user2',
    }).reply(200, [
      {createdAt: '2023-01-01', displayName: 'User One', id: 'user1'},
      {createdAt: '2023-01-02', displayName: 'User Two', id: 'user2'},
    ])

    const {stdout} = await testCommand(List)

    expect(stdout).toMatchSnapshot()
  })

  test('displays an error if the API request fails', async () => {
    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      query: {includeFeatures: 'false'},
      uri: '/projects/test-project',
    }).reply(500, {message: 'Internal Server Error'})

    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      uri: '/invitations/project/test-project',
    }).reply(200, [])

    const {error} = await testCommand(List)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Error fetching members for test-project')
  })

  test('sorts by role when --sort role is specified', async () => {
    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      query: {includeFeatures: 'false'},
      uri: '/projects/test-project',
    }).reply(200, {
      members: [
        {id: 'user1', isRobot: false, role: 'developer'},
        {id: 'user2', isRobot: false, role: 'admin'},
        {id: 'user3', isRobot: false, role: 'viewer'},
      ],
    })
    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      uri: '/invitations/project/test-project',
    }).reply(200, [])

    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      uri: '/users/user1,user2,user3',
    }).reply(200, [
      {createdAt: '2023-01-01', displayName: 'User One', id: 'user1'},
      {createdAt: '2023-01-02', displayName: 'User Two', id: 'user2'},
      {createdAt: '2023-01-03', displayName: 'User Three', id: 'user3'},
    ])

    const {stdout} = await testCommand(List, ['--sort', 'role'])

    // Check that we have all the roles in the output
    expect(stdout).toMatchSnapshot()

    // Split by lines and remove empty lines
    const lines = stdout.split('\n').filter(Boolean)

    // Find the indices of lines containing each role
    const adminIndex = lines.findIndex((line) => line.includes('admin'))
    const developerIndex = lines.findIndex((line) => line.includes('developer'))
    const viewerIndex = lines.findIndex((line) => line.includes('viewer'))

    // Verify they all exist
    expect(adminIndex).toBeGreaterThan(-1)
    expect(developerIndex).toBeGreaterThan(-1)
    expect(viewerIndex).toBeGreaterThan(-1)

    // Now check the sort order (admin should come first alphabetically)
    expect(adminIndex).toBeLessThan(developerIndex)
    expect(developerIndex).toBeLessThan(viewerIndex)
  })

  test('sorts in descending order when --order desc is specified', async () => {
    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      query: {includeFeatures: 'false'},
      uri: '/projects/test-project',
    }).reply(200, {
      members: [
        {id: 'user1', isRobot: false, role: 'developer'},
        {id: 'user2', isRobot: false, role: 'admin'},
        {id: 'user3', isRobot: false, role: 'viewer'},
      ],
    })

    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      uri: '/invitations/project/test-project',
    }).reply(200, [])

    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      uri: '/users/user1,user2,user3',
    }).reply(200, [
      {createdAt: '2023-01-01', displayName: 'User One', id: 'user1'},
      {createdAt: '2023-01-02', displayName: 'User Two', id: 'user2'},
      {createdAt: '2023-01-03', displayName: 'User Three', id: 'user3'},
    ])

    const {stdout} = await testCommand(List, ['--order', 'desc'])

    // Check that we have all the dates in the output
    expect(stdout).toContain('2023-01-01')
    expect(stdout).toContain('2023-01-02')
    expect(stdout).toContain('2023-01-03')

    // By default, it sorts by date, so we need to check the reverse chronological order
    const lines = stdout.split('\n').filter(Boolean)

    const line2023_01_03 = lines.findIndex((line) => line.includes('2023-01-03'))
    const line2023_01_02 = lines.findIndex((line) => line.includes('2023-01-02'))
    const line2023_01_01 = lines.findIndex((line) => line.includes('2023-01-01'))

    expect(line2023_01_03).toBeGreaterThan(0) // First line is header
    expect(line2023_01_02).toBeGreaterThan(0)
    expect(line2023_01_01).toBeGreaterThan(0)

    // Check the order
    expect(line2023_01_03).toBeLessThan(line2023_01_02)
    expect(line2023_01_02).toBeLessThan(line2023_01_01)
  })

  test('excludes invitations when --no-invitations is specified', async () => {
    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      query: {includeFeatures: 'false'},
      uri: '/projects/test-project',
    }).reply(200, {
      members: [
        {id: 'user1', isRobot: false, role: 'developer'},
        {id: 'user2', isRobot: false, role: 'admin'},
      ],
    })

    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      uri: '/users/user1,user2',
    }).reply(200, [
      {createdAt: '2023-01-01', displayName: 'User One', id: 'user1'},
      {createdAt: '2023-01-02', displayName: 'User Two', id: 'user2'},
    ])

    const {stdout} = await testCommand(List, ['--no-invitations'])

    // Check that pending invitation is not in the output
    expect(stdout).not.toContain('pending@example.com')
    expect(stdout).not.toContain('viewer')
  })

  test('excludes robots when --no-robots is specified', async () => {
    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      query: {includeFeatures: 'false'},
      uri: '/projects/test-project',
    }).reply(200, {
      members: [
        {id: 'user1', isRobot: false, role: 'developer'},
        {id: 'user2', isRobot: false, role: 'admin'},
        {id: 'robot1', isRobot: true, role: 'viewer'},
      ],
    })
    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      uri: '/invitations/project/test-project',
    }).reply(200, [])

    mockApi({
      apiVersion: LIST_USERS_API_VERSION,
      uri: '/users/user1,user2',
    }).reply(200, [
      {createdAt: '2023-01-01', displayName: 'User One', id: 'user1'},
      {createdAt: '2023-01-02', displayName: 'User Two', id: 'user2'},
    ])

    const {stdout} = await testCommand(List, ['--no-robots'])

    // Check that robot is not in the output
    expect(stdout).not.toContain('robot1')
    expect(stdout).not.toContain('Robot One')
  })

  test('throws error when no project ID is found', async () => {
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {
        projectId: undefined,
      },
    })

    const {error} = await testCommand(List)

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual('No project ID found')
  })
})

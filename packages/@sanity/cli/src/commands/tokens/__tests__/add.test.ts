import {runCommand} from '@oclif/test'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {TOKENS_API_VERSION} from '../../../actions/tokens/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {Add} from '../add.js'

// Mock the config functions with relative paths
vi.mock('../../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn().mockResolvedValue({
    directory: '/test/path',
    root: '/test/path',
    type: 'studio',
  }),
}))

vi.mock('../../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn().mockResolvedValue({
    api: {
      projectId: 'test-project',
    },
  }),
}))

vi.mock('../../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn().mockResolvedValue('test-token'),
}))

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
  select: vi.fn(),
}))

vi.mock('../../../../../cli-core/src/util/isInteractive.js', () => ({
  isInteractive: true,
}))

describe('tokens add', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('--help works', async () => {
    const {stdout} = await runCommand(['tokens add', '--help'])

    expect(stdout).toContain('Create a new API token for this project')
  })

  test('creates token with label argument and default role', async () => {
    const mockRoles = [
      {
        appliesToRobots: true,
        appliesToUsers: true,
        description: 'Can read documents',
        isCustom: false,
        name: 'viewer',
        projectId: 'test-project',
        title: 'Viewer',
      },
      {
        appliesToRobots: true,
        appliesToUsers: true,
        description: 'Can read and write documents',
        isCustom: false,
        name: 'editor',
        projectId: 'test-project',
        title: 'Editor',
      },
    ]

    const mockToken = {
      id: 'token-123',
      key: 'sk_test_abcd1234',
      label: 'My Test Token',
      projectUserId: 'user-123',
      roles: [
        {
          name: 'viewer',
          title: 'Viewer',
        },
      ],
    }

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/tokens',
    }).reply(200, mockToken)

    const {stdout} = await testCommand(Add, ['My Test Token'])

    expect(stdout).toContain('Token created successfully!')
    expect(stdout).toContain('Label: My Test Token')
    expect(stdout).toContain('ID: token-123')
    expect(stdout).toContain('Role: Viewer')
    expect(stdout).toContain('Token: sk_test_abcd1234')
    expect(stdout).toContain('Copy the token above')
  })

  test('creates token with specific role', async () => {
    const mockRoles = [
      {
        appliesToRobots: true,
        appliesToUsers: true,
        description: 'Can read documents',
        isCustom: false,
        name: 'viewer',
        projectId: 'test-project',
        title: 'Viewer',
      },
      {
        appliesToRobots: true,
        appliesToUsers: true,
        description: 'Can read and write documents',
        isCustom: false,
        name: 'editor',
        projectId: 'test-project',
        title: 'Editor',
      },
    ]

    const mockToken = {
      id: 'token-456',
      key: 'sk_test_editor1234',
      label: 'Editor Token',
      projectUserId: 'user-123',
      roles: [
        {
          name: 'editor',
          title: 'Editor',
        },
      ],
    }

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/tokens',
    }).reply(200, mockToken)

    const {stdout} = await testCommand(Add, ['Editor Token', '--role=editor'])

    expect(stdout).toContain('Token created successfully!')
    expect(stdout).toContain('Label: Editor Token')
    expect(stdout).toContain('Role: Editor')
    expect(stdout).toContain('Token: sk_test_editor1234')
  })

  test('outputs JSON when --json flag is used', async () => {
    const mockRoles = [
      {
        appliesToRobots: true,
        appliesToUsers: true,
        description: 'Can read documents',
        isCustom: false,
        name: 'viewer',
        projectId: 'test-project',
        title: 'Viewer',
      },
    ]

    const mockToken = {
      id: 'token-json',
      key: 'sk_test_json1234',
      label: 'JSON Token',
      projectUserId: 'user-123',
      roles: [
        {
          name: 'viewer',
          title: 'Viewer',
        },
      ],
    }

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/tokens',
    }).reply(200, mockToken)

    const {stdout} = await testCommand(Add, ['JSON Token', '--json'])

    const parsedOutput = JSON.parse(stdout)
    expect(parsedOutput).toEqual(mockToken)
  })

  test('works in unattended mode with --yes flag', async () => {
    const mockToken = {
      id: 'token-unattended',
      key: 'sk_test_unattended1234',
      label: 'Unattended Token',
      projectUserId: 'user-123',
      roles: [
        {
          name: 'viewer',
          title: 'Viewer',
        },
      ],
    }

    // Only mock the token creation API, not the roles API since unattended mode uses default role
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/tokens',
    }).reply(200, mockToken)

    const {stdout} = await testCommand(Add, ['Unattended Token', '--yes'])

    expect(stdout).toContain('Token created successfully!')
    expect(stdout).toContain('Label: Unattended Token')
  })

  test('handles invalid role error', async () => {
    const mockRoles = [
      {
        appliesToRobots: true,
        appliesToUsers: true,
        description: 'Can read documents',
        isCustom: false,
        name: 'viewer',
        projectId: 'test-project',
        title: 'Viewer',
      },
    ]

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    const {error} = await testCommand(Add, ['Test Token', '--role=invalid'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Invalid role "invalid"')
    expect(error?.message).toContain('Available roles: viewer')
  })

  test('handles API error during token creation', async () => {
    const mockRoles = [
      {
        appliesToRobots: true,
        appliesToUsers: true,
        description: 'Can read documents',
        isCustom: false,
        name: 'viewer',
        projectId: 'test-project',
        title: 'Viewer',
      },
    ]

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/tokens',
    }).reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(Add, ['Failed Token'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token creation failed')
    expect(error?.message).toContain('Internal Server Error')
  })

  test('throws error when no project ID is found', async () => {
    const {getCliConfig} = await import('../../../../../cli-core/src/config/cli/getCliConfig.js')
    vi.mocked(getCliConfig).mockResolvedValueOnce({
      api: {
        projectId: undefined,
      },
    })

    const {error} = await testCommand(Add, ['Test Token'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
  })

  test('handles no roles available for tokens', async () => {
    const mockRoles = [
      {
        appliesToRobots: false, // Not applicable to robots
        appliesToUsers: true,
        description: 'Full access',
        isCustom: false,
        name: 'admin',
        projectId: 'test-project',
        title: 'Admin',
      },
    ]

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    const {error} = await testCommand(Add, ['Test Token'])

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No roles available for tokens')
  })
})

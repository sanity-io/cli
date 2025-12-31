import {runCommand} from '@oclif/test'
import {input, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {TOKENS_API_VERSION} from '../../../actions/tokens/constants.js'
import {NO_PROJECT_ID} from '../../../util/errorMessages.js'
import {AddTokenCommand} from '../add.js'

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: vi.fn(),
    select: vi.fn(),
  }
})

const mockedInput = vi.mocked(input)
const mockedSelect = vi.mocked(select)

const testProjectId = 'test-project'

const defaultMocks = {
  cliConfig: {api: {projectId: testProjectId}},
  isInteractive: true,
  projectRoot: {
    directory: '/test/path',
    path: '/test/path/sanity.config.ts',
    type: 'studio' as const,
  },
  token: 'test-token',
}

describe('#tokens:add', () => {
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

    const {stdout} = await testCommand(AddTokenCommand, ['My Test Token'], {mocks: defaultMocks})

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

    const {stdout} = await testCommand(AddTokenCommand, ['Editor Token', '--role=editor'], {
      mocks: defaultMocks,
    })

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

    const {stdout} = await testCommand(AddTokenCommand, ['JSON Token', '--json'], {
      mocks: defaultMocks,
    })

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

    const {stdout} = await testCommand(AddTokenCommand, ['Unattended Token', '--yes'], {
      mocks: defaultMocks,
    })

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

    const {error} = await testCommand(AddTokenCommand, ['Test Token', '--role=invalid'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Invalid role "invalid"')
    expect(error?.message).toContain('Available roles: viewer')
    expect(error?.oclif?.exit).toBe(1)
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

    const {error} = await testCommand(AddTokenCommand, ['Failed Token'], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token creation failed')
    expect(error?.message).toContain('Internal Server Error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no project ID is found', async () => {
    const {error} = await testCommand(AddTokenCommand, ['Test Token'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toEqual(NO_PROJECT_ID)
    expect(error?.oclif?.exit).toBe(1)
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

    const {error} = await testCommand(AddTokenCommand, ['Test Token'], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No roles available for tokens')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('prompts for label when not provided in interactive mode', async () => {
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
      id: 'token-prompted',
      key: 'sk_test_prompted1234',
      label: 'Prompted Label',
      projectUserId: 'user-123',
      roles: [
        {
          name: 'viewer',
          title: 'Viewer',
        },
      ],
    }

    mockedInput.mockResolvedValueOnce('Prompted Label')
    mockedSelect.mockResolvedValueOnce('viewer')

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/projects/test-project/roles',
    }).reply(200, mockRoles)

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/tokens',
    }).reply(200, mockToken)

    const {stdout} = await testCommand(AddTokenCommand, [], {mocks: defaultMocks})

    expect(mockedInput).toHaveBeenCalledWith({
      message: 'Token label:',
      validate: expect.any(Function),
    })
    expect(stdout).toContain('Token created successfully!')
    expect(stdout).toContain('Label: Prompted Label')
  })

  test('validates label input - rejects empty label', async () => {
    // Mock input to capture the validation function and return a valid label
    mockedInput.mockResolvedValueOnce('Valid Label')
    mockedSelect.mockResolvedValueOnce('viewer')

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
      id: 'token-validated',
      key: 'sk_test_validated1234',
      label: 'Valid Label',
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

    await testCommand(AddTokenCommand, [], {mocks: defaultMocks})

    // Test that the validation function correctly rejects empty and whitespace-only strings
    const inputCall = mockedInput.mock.calls[0]
    expect(inputCall).toBeDefined()
    const options = inputCall[0]
    expect(options.validate).toBeDefined()

    if (options.validate) {
      expect(options.validate('')).toBe('Label cannot be empty')
      expect(options.validate('   ')).toBe('Label cannot be empty')
      expect(options.validate('Valid Label')).toBe(true)
    }
  })

  test('throws error when no label provided in non-interactive mode with --yes flag', async () => {
    const {error} = await testCommand(AddTokenCommand, ['--yes'], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token label is required in non-interactive mode')
    expect(error?.message).toContain('Provide a label as an argument')
    expect(error?.oclif?.exit).toBe(1)
  })
})

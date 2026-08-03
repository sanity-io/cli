import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {input, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {TOKENS_API_VERSION} from '../../../actions/tokens/constants.js'
import {CreateTokenCommand} from '../create.js'

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

describe('#tokens:create', () => {
  beforeEach(() => {
    vi.stubEnv('SANITY_INTERNAL_ENV', 'production')
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
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

    const {error, stdout} = await testCommand(CreateTokenCommand, ['My Test Token'], {
      mocks: defaultMocks,
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Label: My Test Token')
    expect(stdout).toContain('ID: token-123')
    expect(stdout).toContain('Role: Viewer')
    expect(stdout).toContain('Token: sk_test_abcd1234')
    expect(stdout).toContain("Copy the token now. It won't be shown again.")
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

    const {stdout} = await testCommand(CreateTokenCommand, ['Editor Token', '--role=editor'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Label: Editor Token')
    expect(stdout).toContain('Role: Editor')
    expect(stdout).toContain('Token: sk_test_editor1234')
  })

  test('outputs JSON when --json flag is used', async () => {
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

    // --json is unattended, so the role defaults to viewer without a roles prompt
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/projects/test-project/tokens',
    }).reply(200, mockToken)

    const {stdout} = await testCommand(CreateTokenCommand, ['JSON Token', '--json'], {
      mocks: defaultMocks,
    })

    const parsedOutput = JSON.parse(stdout)
    expect(parsedOutput).toEqual(mockToken)
    expect(mockedSelect).not.toHaveBeenCalled()
    expect(mockedInput).not.toHaveBeenCalled()
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

    const {stdout} = await testCommand(CreateTokenCommand, ['Unattended Token', '--yes'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Label: Unattended Token')
    expect(mockedSelect).not.toHaveBeenCalled()
    expect(mockedInput).not.toHaveBeenCalled()
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

    const {error} = await testCommand(CreateTokenCommand, ['Test Token', '--role=invalid'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Invalid role "invalid"')
    expect(error?.message).toContain('Available roles: viewer')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
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

    const {error} = await testCommand(CreateTokenCommand, ['Failed Token'], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token creation failed')
    expect(error?.message).toContain('Internal Server Error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no project ID is found', async () => {
    const {error} = await testCommand(CreateTokenCommand, ['Test Token'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
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

    const {error} = await testCommand(CreateTokenCommand, ['Test Token'], {mocks: defaultMocks})

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

    const {stdout} = await testCommand(CreateTokenCommand, [], {mocks: defaultMocks})

    expect(mockedInput).toHaveBeenCalledWith({
      message: 'Token label:',
      validate: expect.any(Function),
    })
    expect(stdout).toContain('API token created')
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

    await testCommand(CreateTokenCommand, [], {mocks: defaultMocks})

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

  test.each([
    {args: ['--yes'], description: 'with --yes', isInteractive: true},
    {args: [], description: 'without an interactive terminal', isInteractive: false},
  ])('requires a label in unattended mode $description', async ({args, isInteractive}) => {
    const {error} = await testCommand(CreateTokenCommand, args, {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
        isInteractive,
      },
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token label is required')
    expect(error?.message).toContain('<label>')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('rejects an empty label argument before project lookup', async () => {
    const {error} = await testCommand(CreateTokenCommand, ['   ', '--yes'], {
      mocks: {...defaultMocks, cliConfig: {api: {projectId: undefined}}},
    })

    expect(error?.message).toContain('Token label cannot be empty')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })
})

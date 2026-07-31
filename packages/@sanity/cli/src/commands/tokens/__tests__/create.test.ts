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

const viewerRole = {
  appliesToRobots: true,
  appliesToUsers: true,
  description: 'Can read documents',
  isCustom: false,
  name: 'viewer',
  resourceId: testProjectId,
  resourceType: 'project',
  title: 'Viewer',
}

const editorRole = {
  appliesToRobots: true,
  appliesToUsers: true,
  description: 'Can read and write documents',
  isCustom: false,
  name: 'editor',
  resourceId: testProjectId,
  resourceType: 'project',
  title: 'Editor',
}

function mockRobotWithToken(options: {
  expiresAt?: string
  id: string
  label: string
  roleNames: string[]
  token: string
}) {
  return {
    createdAt: '2026-07-01T00:00:00.000Z',
    expiresAt: options.expiresAt ?? null,
    id: options.id,
    label: options.label,
    memberships: [
      {
        resourceId: testProjectId,
        resourceType: 'project',
        resourceUserId: 'user-123',
        roleNames: options.roleNames,
      },
    ],
    token: options.token,
    // Distinct from `id` on purpose: the robot id is the public identifier
    tokenId: `${options.id}-active-token`,
  }
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
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/roles',
    }).reply(200, {data: [viewerRole, editorRole], nextCursor: null})

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/project/test-project/robots',
    }).reply(
      201,
      mockRobotWithToken({
        id: 'robot-123',
        label: 'My Test Token',
        roleNames: ['viewer'],
        token: 'sk_test_abcd1234',
      }),
    )

    mockedSelect.mockResolvedValueOnce('viewer').mockResolvedValueOnce('never')

    const {error, stdout} = await testCommand(CreateTokenCommand, ['My Test Token'], {
      mocks: defaultMocks,
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Label: My Test Token')
    expect(stdout).toContain('ID: robot-123')
    expect(stdout).toContain('Role: Viewer')
    expect(stdout).toContain('Token: sk_test_abcd1234')
    expect(stdout).toContain("Copy the token now. It won't be shown again.")
  })

  test('creates token with specific role', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/roles',
    }).reply(200, {data: [viewerRole, editorRole], nextCursor: null})

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/project/test-project/robots',
    }).reply(
      201,
      mockRobotWithToken({
        id: 'robot-456',
        label: 'Editor Token',
        roleNames: ['editor'],
        token: 'sk_test_editor1234',
      }),
    )

    mockedSelect.mockResolvedValueOnce('never')

    const {stdout} = await testCommand(CreateTokenCommand, ['Editor Token', '--role=editor'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Label: Editor Token')
    expect(stdout).toContain('Role: Editor')
    expect(stdout).toContain('Token: sk_test_editor1234')
  })

  test('outputs the created robot as JSON when --json flag is used', async () => {
    const robotWithToken = mockRobotWithToken({
      id: 'robot-json',
      label: 'JSON Token',
      roleNames: ['viewer'],
      token: 'sk_test_json1234',
    })

    // --json is unattended, so the role defaults to viewer without a roles prompt
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/project/test-project/robots',
    }).reply(201, robotWithToken)

    const {stdout} = await testCommand(CreateTokenCommand, ['JSON Token', '--json'], {
      mocks: defaultMocks,
    })

    const parsedOutput = JSON.parse(stdout)
    expect(parsedOutput).toEqual(robotWithToken)
    expect(mockedSelect).not.toHaveBeenCalled()
    expect(mockedInput).not.toHaveBeenCalled()
  })

  test('works in unattended mode with --yes flag', async () => {
    // Only mock the robot creation API, not the roles API since unattended mode uses default role
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/project/test-project/robots',
    }).reply(
      201,
      mockRobotWithToken({
        id: 'robot-unattended',
        label: 'Unattended Token',
        roleNames: ['viewer'],
        token: 'sk_test_unattended1234',
      }),
    )

    const {stdout} = await testCommand(CreateTokenCommand, ['Unattended Token', '--yes'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Label: Unattended Token')
    expect(mockedSelect).not.toHaveBeenCalled()
    expect(mockedInput).not.toHaveBeenCalled()
  })

  test('creates token with an expiry date', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/project/test-project/robots',
    }).reply(
      201,
      mockRobotWithToken({
        expiresAt: '2030-01-01T00:00:00.000Z',
        id: 'robot-expiring',
        label: 'Expiring Token',
        roleNames: ['viewer'],
        token: 'sk_test_expiring1234',
      }),
    )

    const {stdout} = await testCommand(
      CreateTokenCommand,
      ['Expiring Token', '--expires-at', '2030-01-01', '--yes'],
      {mocks: defaultMocks},
    )

    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Expires: 2030-01-01T00:00:00.000Z')
  })

  test('prompts for expiry in interactive mode and applies a preset', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/roles',
    }).reply(200, {data: [viewerRole], nextCursor: null})

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/project/test-project/robots',
    }).reply(
      201,
      mockRobotWithToken({
        expiresAt: '2026-08-30T00:00:00.000Z',
        id: 'robot-preset',
        label: 'Preset Token',
        roleNames: ['viewer'],
        token: 'sk_test_preset1234',
      }),
    )

    mockedSelect.mockResolvedValueOnce('viewer').mockResolvedValueOnce('30')

    const {stdout} = await testCommand(CreateTokenCommand, ['Preset Token'], {mocks: defaultMocks})

    expect(mockedSelect).toHaveBeenLastCalledWith({
      choices: [
        {name: 'Never', value: 'never'},
        {name: expect.stringMatching(/^30 days \(\d{4}-\d{2}-\d{2}\)$/), value: '30'},
        {name: expect.stringMatching(/^60 days \(\d{4}-\d{2}-\d{2}\)$/), value: '60'},
        {name: expect.stringMatching(/^90 days \(\d{4}-\d{2}-\d{2}\)$/), value: '90'},
        {name: 'Custom date', value: 'custom'},
      ],
      default: 'never',
      message: 'Token expiry:',
    })
    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Expires: 2026-08-30T00:00:00.000Z')
  })

  test('prompts for a custom expiry date', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/roles',
    }).reply(200, {data: [viewerRole], nextCursor: null})

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/project/test-project/robots',
    }).reply(
      201,
      mockRobotWithToken({
        expiresAt: '2030-01-01T00:00:00.000Z',
        id: 'robot-custom',
        label: 'Custom Token',
        roleNames: ['viewer'],
        token: 'sk_test_custom1234',
      }),
    )

    mockedSelect.mockResolvedValueOnce('viewer').mockResolvedValueOnce('custom')
    mockedInput.mockResolvedValueOnce('2030-01-01')

    const {stdout} = await testCommand(CreateTokenCommand, ['Custom Token'], {mocks: defaultMocks})

    expect(mockedInput).toHaveBeenCalledWith({
      message: 'Expiry date (ISO 8601, e.g. 2027-01-01):',
      validate: expect.any(Function),
    })
    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Expires: 2030-01-01T00:00:00.000Z')
  })

  test('rejects an invalid expiry date', async () => {
    const {error} = await testCommand(
      CreateTokenCommand,
      ['Test Token', '--expires-at', 'not-a-date', '--yes'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Invalid expiry date "not-a-date"')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('rejects an expiry date in the past', async () => {
    const {error} = await testCommand(
      CreateTokenCommand,
      ['Test Token', '--expires-at', '2020-01-01', '--yes'],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Expiry date "2020-01-01" must be in the future')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('handles invalid role error', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/roles',
    }).reply(200, {data: [viewerRole], nextCursor: null})

    const {error} = await testCommand(CreateTokenCommand, ['Test Token', '--role=invalid'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Invalid role "invalid"')
    expect(error?.message).toContain('Available roles: viewer')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('handles API error during token creation', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/roles',
    }).reply(200, {data: [viewerRole], nextCursor: null})

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/project/test-project/robots',
    }).reply(500, {message: 'Internal Server Error'})

    mockedSelect.mockResolvedValueOnce('viewer').mockResolvedValueOnce('never')

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
    const adminRole = {
      ...viewerRole,
      appliesToRobots: false, // Not applicable to robots
      description: 'Full access',
      name: 'admin',
      title: 'Admin',
    }

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/roles',
    }).reply(200, {data: [adminRole], nextCursor: null})

    const {error} = await testCommand(CreateTokenCommand, ['Test Token'], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No roles available for tokens')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('prompts for label when not provided in interactive mode', async () => {
    mockedInput.mockResolvedValueOnce('Prompted Label')
    mockedSelect.mockResolvedValueOnce('viewer').mockResolvedValueOnce('never')

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/roles',
    }).reply(200, {data: [viewerRole], nextCursor: null})

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/project/test-project/robots',
    }).reply(
      201,
      mockRobotWithToken({
        id: 'robot-prompted',
        label: 'Prompted Label',
        roleNames: ['viewer'],
        token: 'sk_test_prompted1234',
      }),
    )

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
    mockedSelect.mockResolvedValueOnce('viewer').mockResolvedValueOnce('never')

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/roles',
    }).reply(200, {data: [viewerRole], nextCursor: null})

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/project/test-project/robots',
    }).reply(
      201,
      mockRobotWithToken({
        id: 'robot-validated',
        label: 'Valid Label',
        roleNames: ['viewer'],
        token: 'sk_test_validated1234',
      }),
    )

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

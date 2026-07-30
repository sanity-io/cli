import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {input, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {TOKENS_API_VERSION} from '../../../actions/tokens/constants.js'
import {getPresetExpiryDate} from '../../../actions/tokens/expiry.js'
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
  title: 'Viewer',
}

const editorRole = {
  appliesToRobots: true,
  appliesToUsers: true,
  description: 'Can read and write documents',
  isCustom: false,
  name: 'editor',
  title: 'Editor',
}

const createRobot = (overrides: Record<string, unknown> = {}) => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: null,
  id: 'g-robot-123',
  label: 'My Test Token',
  managedBy: {resourceId: testProjectId, resourceType: 'project'},
  memberships: [
    {
      addedAt: '2026-01-01T00:00:00.000Z',
      resourceId: testProjectId,
      resourceType: 'project',
      roleNames: ['viewer'],
    },
  ],
  token: 'sk_test_abcd1234',
  tokenId: 'si-token-123',
  ...overrides,
})

const mockRolesApi = (roles: unknown[] = [viewerRole, editorRole]) =>
  mockApi({
    apiVersion: TOKENS_API_VERSION,
    query: {includeChildren: 'false', limit: '500'},
    uri: `/access/project/${testProjectId}/roles`,
  }).reply(200, {data: roles, nextCursor: null})

const mockCreateRobotApi = () =>
  mockApi({
    apiVersion: TOKENS_API_VERSION,
    method: 'post',
    uri: `/access/project/${testProjectId}/robots`,
  })

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

  test('creates token with label argument and prompted role and expiry', async () => {
    mockedSelect.mockResolvedValueOnce('viewer') // role
    mockedSelect.mockResolvedValueOnce('none') // expiry

    mockRolesApi()
    mockCreateRobotApi().reply(201, createRobot())

    const {error, stdout} = await testCommand(CreateTokenCommand, ['My Test Token'], {
      mocks: defaultMocks,
    })

    expect(error).toBeUndefined()
    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Label: My Test Token')
    expect(stdout).toContain('ID: g-robot-123')
    expect(stdout).toContain('Role: Viewer')
    expect(stdout).toContain('Expires: Never')
    expect(stdout).toContain('Token: sk_test_abcd1234')
    expect(stdout).toContain("Copy the token now. It won't be shown again.")
  })

  test('offers expiry choices matching the Manage token creation flow', async () => {
    mockedSelect.mockResolvedValueOnce('viewer')
    mockedSelect.mockResolvedValueOnce('none')

    mockRolesApi()
    mockCreateRobotApi().reply(201, createRobot())

    await testCommand(CreateTokenCommand, ['My Test Token'], {mocks: defaultMocks})

    const expiryCall = mockedSelect.mock.calls[1][0]
    expect(expiryCall.message).toBe('Token expiration:')
    expect(expiryCall.default).toBe('none')
    expect(expiryCall.choices.map((choice) => (choice as {value: string}).value)).toEqual([
      'none',
      '30',
      '60',
      '90',
      'custom',
    ])
    expect((expiryCall.choices[0] as {name: string}).name).toBe('No expiration')
    expect((expiryCall.choices[1] as {name: string}).name).toMatch(
      /^30 days \(\d{2} \w{3} \d{4}\)$/,
    )
  })

  test('creates token with a preset expiry', async () => {
    mockedSelect.mockResolvedValueOnce('viewer')
    mockedSelect.mockResolvedValueOnce('30')

    const expectedDate = getPresetExpiryDate(30)
    let requestBody: Record<string, unknown> = {}

    mockRolesApi()
    mockCreateRobotApi().reply(201, (uri, body) => {
      requestBody = body as Record<string, unknown>
      return createRobot({expiresAt: `${expectedDate}T00:00:00.000Z`})
    })

    const {stdout} = await testCommand(CreateTokenCommand, ['My Test Token'], {
      mocks: defaultMocks,
    })

    expect(requestBody.expiresAt).toBe(expectedDate)
    expect(requestBody.memberships).toEqual([
      {resourceId: testProjectId, resourceType: 'project', roleNames: ['viewer']},
    ])
    expect(stdout).toContain(`Expires: ${expectedDate}`)
  })

  test('creates token with a custom expiry date', async () => {
    mockedSelect.mockResolvedValueOnce('viewer')
    mockedSelect.mockResolvedValueOnce('custom')
    mockedInput.mockResolvedValueOnce('2099-12-31')

    let requestBody: Record<string, unknown> = {}

    mockRolesApi()
    mockCreateRobotApi().reply(201, (uri, body) => {
      requestBody = body as Record<string, unknown>
      return createRobot({expiresAt: '2099-12-31T00:00:00.000Z'})
    })

    const {stdout} = await testCommand(CreateTokenCommand, ['My Test Token'], {
      mocks: defaultMocks,
    })

    expect(mockedInput).toHaveBeenCalledWith({
      message: 'Expiration date (YYYY-MM-DD):',
      validate: expect.any(Function),
    })
    expect(requestBody.expiresAt).toBe('2099-12-31')
    expect(stdout).toContain('Expires: 2099-12-31')
  })

  test('creates token with --expires-at flag without prompting for expiry', async () => {
    mockedSelect.mockResolvedValueOnce('viewer')

    let requestBody: Record<string, unknown> = {}

    mockRolesApi()
    mockCreateRobotApi().reply(201, (uri, body) => {
      requestBody = body as Record<string, unknown>
      return createRobot({expiresAt: '2099-06-15T00:00:00.000Z'})
    })

    const {stdout} = await testCommand(
      CreateTokenCommand,
      ['My Test Token', '--expires-at=2099-06-15'],
      {mocks: defaultMocks},
    )

    expect(mockedSelect).toHaveBeenCalledTimes(1) // only the role prompt
    expect(requestBody.expiresAt).toBe('2099-06-15')
    expect(stdout).toContain('Expires: 2099-06-15')
  })

  test.each([
    {reason: 'not a date', value: 'soon'},
    {reason: 'wrong format', value: '15-06-2099'},
    {reason: 'invalid date', value: '2099-13-45'},
    {reason: 'in the past', value: '2020-01-01'},
  ])('rejects --expires-at value that is $reason', async ({value}) => {
    mockedSelect.mockResolvedValueOnce('viewer')
    mockRolesApi()

    const {error} = await testCommand(
      CreateTokenCommand,
      ['My Test Token', `--expires-at=${value}`],
      {mocks: defaultMocks},
    )

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Invalid `--expires-at` value')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('creates token with specific role', async () => {
    mockedSelect.mockResolvedValueOnce('none') // expiry

    mockRolesApi()
    mockCreateRobotApi().reply(
      201,
      createRobot({
        label: 'Editor Token',
        memberships: [
          {
            addedAt: '2026-01-01T00:00:00.000Z',
            resourceId: testProjectId,
            resourceType: 'project',
            roleNames: ['editor'],
          },
        ],
        token: 'sk_test_editor1234',
      }),
    )

    const {stdout} = await testCommand(CreateTokenCommand, ['Editor Token', '--role=editor'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Label: Editor Token')
    expect(stdout).toContain('Role: Editor')
    expect(stdout).toContain('Token: sk_test_editor1234')
  })

  test('outputs JSON when --json flag is used', async () => {
    // --json is unattended, so the role defaults to viewer without any prompts
    mockCreateRobotApi().reply(201, createRobot({label: 'JSON Token', token: 'sk_test_json1234'}))

    const {stdout} = await testCommand(CreateTokenCommand, ['JSON Token', '--json'], {
      mocks: defaultMocks,
    })

    const parsedOutput = JSON.parse(stdout)
    expect(parsedOutput).toEqual({
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
      id: 'g-robot-123',
      key: 'sk_test_json1234',
      label: 'JSON Token',
      roles: [{name: 'viewer', title: 'Viewer'}],
      tokenId: 'si-token-123',
    })
    expect(mockedSelect).not.toHaveBeenCalled()
    expect(mockedInput).not.toHaveBeenCalled()
  })

  test('works in unattended mode with --yes flag', async () => {
    // Only mock the robot creation API; unattended mode uses the default role
    // and no expiry without prompting
    let requestBody: Record<string, unknown> = {}
    mockCreateRobotApi().reply(201, (uri, body) => {
      requestBody = body as Record<string, unknown>
      return createRobot({label: 'Unattended Token'})
    })

    const {stdout} = await testCommand(CreateTokenCommand, ['Unattended Token', '--yes'], {
      mocks: defaultMocks,
    })

    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Label: Unattended Token')
    expect(stdout).toContain('Expires: Never')
    expect(requestBody.expiresAt).toBeUndefined()
    expect(mockedSelect).not.toHaveBeenCalled()
    expect(mockedInput).not.toHaveBeenCalled()
  })

  test('accepts --expires-at in unattended mode', async () => {
    let requestBody: Record<string, unknown> = {}
    mockCreateRobotApi().reply(201, (uri, body) => {
      requestBody = body as Record<string, unknown>
      return createRobot({expiresAt: '2099-06-15T00:00:00.000Z', label: 'CI Token'})
    })

    const {stdout} = await testCommand(
      CreateTokenCommand,
      ['CI Token', '--yes', '--expires-at=2099-06-15'],
      {mocks: defaultMocks},
    )

    expect(requestBody.expiresAt).toBe('2099-06-15')
    expect(stdout).toContain('Expires: 2099-06-15')
    expect(mockedSelect).not.toHaveBeenCalled()
  })

  test('handles invalid role error', async () => {
    mockRolesApi([viewerRole])

    const {error} = await testCommand(CreateTokenCommand, ['Test Token', '--role=invalid'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Invalid role "invalid"')
    expect(error?.message).toContain('Available roles: viewer')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('handles API error during token creation', async () => {
    mockedSelect.mockResolvedValueOnce('viewer')
    mockedSelect.mockResolvedValueOnce('none')

    mockRolesApi([viewerRole])
    mockCreateRobotApi().reply(500, {message: 'Internal Server Error'})

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
    mockRolesApi([
      {
        appliesToRobots: false, // Not applicable to robots
        appliesToUsers: true,
        description: 'Full access',
        isCustom: false,
        name: 'admin',
        title: 'Admin',
      },
    ])

    const {error} = await testCommand(CreateTokenCommand, ['Test Token'], {mocks: defaultMocks})

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('No roles available for tokens')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('prompts for label when not provided in interactive mode', async () => {
    mockedInput.mockResolvedValueOnce('Prompted Label')
    mockedSelect.mockResolvedValueOnce('viewer')
    mockedSelect.mockResolvedValueOnce('none')

    mockRolesApi([viewerRole])
    mockCreateRobotApi().reply(201, createRobot({label: 'Prompted Label'}))

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
    mockedSelect.mockResolvedValueOnce('none')

    mockRolesApi([viewerRole])
    mockCreateRobotApi().reply(201, createRobot({label: 'Valid Label'}))

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

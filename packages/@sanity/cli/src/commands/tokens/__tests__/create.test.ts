import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {input, roleChecklist, select} from '@sanity/cli-core/ux'
import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {TOKENS_API_VERSION} from '../../../actions/tokens/constants.js'
import {listProjects} from '../../../services/projects.js'
import {CreateTokenCommand} from '../create.js'

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    input: vi.fn(),
    roleChecklist: vi.fn(),
    select: vi.fn(),
  }
})

vi.mock('../../../services/projects.js', () => ({listProjects: vi.fn()}))

const mockedInput = vi.mocked(input)
const mockedRoleChecklist = vi.mocked(roleChecklist)
const mockedSelect = vi.mocked(select)
const mockedListProjects = vi.mocked(listProjects)

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

function mockRobotCreation(uri: string) {
  const request: {body?: unknown} = {}
  const [, resourceType, resourceId] = uri.split('/').slice(1)
  mockApi({apiVersion: TOKENS_API_VERSION, method: 'post', uri}).reply(201, (_uri, body) => {
    request.body = body
    return {
      ...mockRobotWithToken({
        id: 'robot-new',
        label: 'CI',
        roleNames: [],
        token: 'sk_new',
      }),
      managedBy: {resourceId, resourceType},
    }
  })
  return request
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

  test('creates an organization token from the checklist and prints the equivalent command', async () => {
    mockedListProjects.mockResolvedValueOnce([
      {displayName: 'Website', id: testProjectId, organizationId: 'org-1'},
      {displayName: 'Catalog', id: 'catalog', organizationId: 'org-1'},
      {displayName: 'Elsewhere', id: 'elsewhere', organizationId: 'org-2'},
    ] as Awaited<ReturnType<typeof listProjects>>)
    mockedSelect.mockResolvedValueOnce('30')
    mockedRoleChecklist.mockResolvedValueOnce([
      {role: 'developer', value: 'context'},
      {value: 'blueprints'},
      {role: 'editor', value: `project:${testProjectId}`},
      {role: 'viewer', value: 'project:catalog'},
    ])

    const request = mockRobotCreation('/access/organization/org-1/robots')

    const {error, stdout} = await testCommand(CreateTokenCommand, ['CI'], {
      mocks: defaultMocks,
    })

    expect(error).toBeUndefined()
    const {sections} = mockedRoleChecklist.mock.calls[0][0]
    expect(sections[1].items.map(({value}) => value)).toEqual([
      `project:${testProjectId}`,
      'project:catalog',
    ])
    expect(sections[1].items.some(({checked}) => checked)).toBe(false)
    expect(mockedListProjects).toHaveBeenCalledWith({onlyExplicitMembership: false})
    const {expiresAt} = request.body as {expiresAt: string}
    expect(request.body).toEqual({
      expiresAt: expect.any(String),
      label: 'CI',
      memberships: [
        {
          resourceId: 'org-1',
          resourceType: 'organization',
          roleNames: ['knowledge-base-developer-robot', 'blueprints-deployer-robot'],
        },
        {
          resourceId: testProjectId,
          resourceType: 'project',
          roleNames: ['editor'],
        },
        {
          resourceId: 'catalog',
          resourceType: 'project',
          roleNames: ['viewer'],
        },
      ],
    })
    expect(stdout).toContain('Token: sk_new')
    expect(stdout).toContain(
      `tokens create CI --organization org-1 --expires-at ${expiresAt} --grant context=developer --grant blueprints --grant project:${testProjectId}=editor --grant project:catalog=viewer --yes`,
    )
  })

  test('rejects a --project outside the organization before prompting', async () => {
    mockedListProjects.mockResolvedValueOnce([
      {displayName: 'Website', id: testProjectId, organizationId: 'org-1'},
    ] as Awaited<ReturnType<typeof listProjects>>)

    const {error} = await testCommand(
      CreateTokenCommand,
      ['CI', '--project=elsewhere', '--organization=org-1'],
      {mocks: defaultMocks},
    )

    expect(error?.message).toContain("Project elsewhere isn't in organization org-1")
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
    expect(mockedRoleChecklist).not.toHaveBeenCalled()
  })

  test('merges repeated --grant flags into one membership per resource', async () => {
    const request = mockRobotCreation('/access/organization/org-1/robots')

    const {error} = await testCommand(
      CreateTokenCommand,
      [
        'CI',
        '--organization=org-1',
        '--grant=context=editor',
        '--grant=context=editor',
        '--grant=project:p1=editor',
        '--grant=project:p1=editor,deploy-studio',
        '--yes',
      ],
      {mocks: defaultMocks},
    )

    expect(error).toBeUndefined()
    expect(request.body).toEqual({
      label: 'CI',
      memberships: [
        {
          resourceId: 'org-1',
          resourceType: 'organization',
          roleNames: ['knowledge-base-editor-robot'],
        },
        {
          resourceId: 'p1',
          resourceType: 'project',
          roleNames: ['editor', 'deploy-studio'],
        },
      ],
    })
  })

  test('uses the explicit project grant role instead of adding viewer for --project', async () => {
    const request = mockRobotCreation('/access/project/p1/robots')

    const {error} = await testCommand(
      CreateTokenCommand,
      ['CI', '--project=p1', '--grant=project:p1=restricted-reader', '--yes'],
      {mocks: defaultMocks},
    )

    expect(error).toBeUndefined()
    expect(request.body).toEqual({
      label: 'CI',
      memberships: [
        {
          resourceId: 'p1',
          resourceType: 'project',
          roleNames: ['restricted-reader'],
        },
      ],
    })
  })

  test('explains a 403 from the organization endpoint', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'post',
      uri: '/access/organization/org-1/robots',
    }).reply(403, {message: 'Forbidden'})

    const {error} = await testCommand(
      CreateTokenCommand,
      ['CI', '--organization=org-1', '--grant=blueprints', '--yes'],
      {mocks: defaultMocks},
    )

    expect(error?.message).toContain('You need permission to create organization tokens')
    expect(error?.oclif?.exit).toBe(exitCodes.RUNTIME_ERROR)
  })

  test('creates a project token with --role, as before org grants', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/roles',
    }).reply(200, {data: [viewerRole, editorRole], nextCursor: null})

    const request = mockRobotCreation('/access/project/test-project/robots')

    mockedSelect.mockResolvedValueOnce('never')

    const {stdout} = await testCommand(CreateTokenCommand, ['Editor Token', '--role=editor'], {
      mocks: defaultMocks,
    })

    expect(request.body).toEqual({
      label: 'Editor Token',
      memberships: [
        {
          resourceId: testProjectId,
          resourceType: 'project',
          roleNames: ['editor'],
        },
      ],
    })
    expect(stdout).toContain('API token created')
    expect(stdout).toContain('Role: Editor')
    expect(stdout).toContain("'Editor Token' --grant project:test-project=editor")
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
    expect(stdout).toContain('Role: Viewer')
    expect(stdout).not.toContain('To create the same token')
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

    mockedSelect.mockResolvedValueOnce('30')

    const {stdout} = await testCommand(CreateTokenCommand, ['Preset Token', '--role=viewer'], {
      mocks: defaultMocks,
    })

    expect(mockedSelect).toHaveBeenLastCalledWith({
      choices: [
        {name: 'Never', value: 'never'},
        {
          name: expect.stringMatching(/^30 days \(\d{4}-\d{2}-\d{2}\)$/),
          value: '30',
        },
        {
          name: expect.stringMatching(/^60 days \(\d{4}-\d{2}-\d{2}\)$/),
          value: '60',
        },
        {
          name: expect.stringMatching(/^90 days \(\d{4}-\d{2}-\d{2}\)$/),
          value: '90',
        },
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

    mockedSelect.mockResolvedValueOnce('custom')
    mockedInput.mockResolvedValueOnce('2030-01-01')

    const {stdout} = await testCommand(CreateTokenCommand, ['Custom Token', '--role=viewer'], {
      mocks: defaultMocks,
    })

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

    mockedSelect.mockResolvedValueOnce('never')

    const {error} = await testCommand(CreateTokenCommand, ['Failed Token', '--role=viewer'], {
      mocks: defaultMocks,
    })

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token creation failed')
    expect(error?.message).toContain('Internal Server Error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('requires a grant or project in unattended mode', async () => {
    const {error} = await testCommand(CreateTokenCommand, ['Test Token', '--yes'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
      },
    })

    expect(error?.message).toContain('Token access is required')
    expect(error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
  })

  test('prompts for label when not provided in interactive mode', async () => {
    mockedInput.mockResolvedValueOnce('Prompted Label')
    mockedSelect.mockResolvedValueOnce('never')

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

    const {stdout} = await testCommand(CreateTokenCommand, ['--role=viewer'], {
      mocks: defaultMocks,
    })

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
    mockedSelect.mockResolvedValueOnce('never')

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

    await testCommand(CreateTokenCommand, ['--role=viewer'], {
      mocks: defaultMocks,
    })

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
    {
      args: [],
      description: 'without an interactive terminal',
      isInteractive: false,
    },
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

import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {TOKENS_API_VERSION} from '../../../actions/tokens/constants.js'
import {type Robot} from '../../../actions/tokens/types.js'
import {DeleteTokensCommand} from '../delete.js'

const testProjectId = 'test-project'

// Test fixtures
const createRobot = (overrides: Partial<Robot> & {id: string}): Robot => ({
  createdAt: '2023-01-01T00:00:00.000Z',
  expiresAt: null,
  label: 'Test Token',
  managedBy: {resourceId: testProjectId, resourceType: 'project'},
  memberships: [
    {
      addedAt: '2023-01-01T00:00:00.000Z',
      resourceId: testProjectId,
      resourceType: 'project',
      roleNames: ['editor'],
    },
  ],
  tokenId: `si-${overrides.id}`,
  ...overrides,
})

const TEST_ROBOTS = {
  API_TOKEN: createRobot({
    id: 'g-robot-api-123',
    label: 'API Token',
  }),
  READ_TOKEN: createRobot({
    id: 'g-robot-read-456',
    label: 'Read Token',
    memberships: [
      {
        addedAt: '2023-01-01T00:00:00.000Z',
        resourceId: testProjectId,
        resourceType: 'project',
        roleNames: ['viewer'],
      },
    ],
  }),
} as const

const mockRoles = [
  {
    appliesToRobots: true,
    appliesToUsers: true,
    description: 'Can read and write documents',
    isCustom: false,
    name: 'editor',
    title: 'Editor',
  },
  {
    appliesToRobots: true,
    appliesToUsers: true,
    description: 'Can read documents',
    isCustom: false,
    name: 'viewer',
    title: 'Viewer',
  },
]

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

const mockRobotsApi = () =>
  mockApi({
    apiVersion: TOKENS_API_VERSION,
    query: {includeChildren: 'false'},
    uri: `/access/project/${testProjectId}/robots`,
  })

const mockRolesApi = () =>
  mockApi({
    apiVersion: TOKENS_API_VERSION,
    query: {includeChildren: 'false', limit: '500'},
    uri: `/access/project/${testProjectId}/roles`,
  })

const mockDeleteRobotApi = (robotId: string) =>
  mockApi({
    apiVersion: TOKENS_API_VERSION,
    method: 'delete',
    uri: `/access/project/${testProjectId}/robots/${robotId}`,
  })

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: vi.fn(),
    select: vi.fn(),
  }
})

describe('#tokens:delete', () => {
  afterEach(() => {
    vi.clearAllMocks()
    const pending = pendingMocks()
    cleanAll()
    expect(pending, 'pending mocks').toEqual([])
  })

  test('deletes a specific token by ID with confirmation', async () => {
    const {confirm} = await import('@sanity/cli-core/ux')
    vi.mocked(confirm).mockResolvedValue(true)

    mockDeleteRobotApi('g-robot-api-123').reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, ['g-robot-api-123'], {
      mocks: defaultMocks,
    })
    expect(stdout).toBe('API token deleted\n')
    expect(confirm).toHaveBeenCalledWith({
      default: false,
      message: 'Delete API token "g-robot-api-123"?',
    })
  })

  test('deletes a specific token by ID with --yes flag (skips confirmation)', async () => {
    const {confirm} = await import('@sanity/cli-core/ux')
    mockDeleteRobotApi('g-robot-api-123').reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, ['g-robot-api-123', '--yes'], {
      mocks: defaultMocks,
    })
    expect(stdout).toBe('API token deleted\n')
    expect(confirm).not.toHaveBeenCalled()
  })

  test('deletes a specific token by ID with -y flag (skips confirmation)', async () => {
    mockDeleteRobotApi('g-robot-api-123').reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, ['g-robot-api-123', '-y'], {
      mocks: defaultMocks,
    })
    expect(stdout).toBe('API token deleted\n')
  })

  test('deletes a token by its legacy token ID', async () => {
    // A legacy token ID (from the deprecated Projects API) is not a robot ID,
    // so the first delete attempt 404s and the ID is resolved via the robot list
    mockDeleteRobotApi('si-g-robot-api-123').reply(404, {message: 'Robot not found'})
    mockRobotsApi().reply(200, {
      data: [TEST_ROBOTS.API_TOKEN, TEST_ROBOTS.READ_TOKEN],
      nextCursor: null,
    })
    mockDeleteRobotApi('g-robot-api-123').reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, ['si-g-robot-api-123', '--yes'], {
      mocks: defaultMocks,
    })
    expect(stdout).toBe('API token deleted\n')
  })

  test('throws not found when the ID matches no robot or legacy token ID', async () => {
    mockDeleteRobotApi('nonexistent-token').reply(404, {message: 'Robot not found'})
    mockRobotsApi().reply(200, {data: [TEST_ROBOTS.API_TOKEN], nextCursor: null})

    const {error} = await testCommand(DeleteTokensCommand, ['nonexistent-token', '--yes'], {
      mocks: defaultMocks,
    })
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token with ID "nonexistent-token" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('surfaces the original not found error when the robot list cannot be fetched', async () => {
    mockDeleteRobotApi('nonexistent-token').reply(404, {message: 'Robot not found'})
    mockRobotsApi().reply(403, {message: 'Forbidden'})

    const {error} = await testCommand(DeleteTokensCommand, ['nonexistent-token', '--yes'], {
      mocks: defaultMocks,
    })
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token with ID "nonexistent-token" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('cancels deletion when user declines confirmation', async () => {
    const {confirm} = await import('@sanity/cli-core/ux')
    vi.mocked(confirm).mockResolvedValue(false)

    const {error, stdout} = await testCommand(DeleteTokensCommand, ['g-robot-api-123'], {
      mocks: defaultMocks,
    })
    expect(error).toBeInstanceOf(Error)
    expect(error?.oclif?.exit).toBe(exitCodes.USER_ABORT)
    expect(stdout).toBe('API token not deleted\n')
  })

  test('requires a token ID and --yes in unattended mode', async () => {
    const {confirm, select} = await import('@sanity/cli-core/ux')
    const missingId = await testCommand(DeleteTokensCommand, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId: undefined}},
        isInteractive: false,
      },
    })
    expect(missingId.error?.message).toBe(
      'Token ID is required. Pass it as the `<tokenId>` argument.\n' +
        'Error: Deletion requires confirmation. Pass `--yes` to delete the token.',
    )
    expect(missingId.error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)

    const missingConfirmation = await testCommand(DeleteTokensCommand, ['g-robot-api-123'], {
      mocks: {...defaultMocks, isInteractive: false},
    })
    expect(missingConfirmation.error?.message).toContain('--yes')
    expect(missingConfirmation.error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
    expect(confirm).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  test('prompts user to select token when none specified', async () => {
    const {confirm, select} = await import('@sanity/cli-core/ux')
    vi.mocked(select).mockResolvedValue('g-robot-read-456')
    vi.mocked(confirm).mockResolvedValue(true)

    mockRobotsApi().reply(200, {
      data: [TEST_ROBOTS.API_TOKEN, TEST_ROBOTS.READ_TOKEN],
      nextCursor: null,
    })
    mockRolesApi().reply(200, {data: mockRoles, nextCursor: null})
    mockDeleteRobotApi('g-robot-read-456').reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(stdout).toBe('API token deleted\n')
    expect(select).toHaveBeenCalledWith({
      choices: [
        {name: 'API Token (Editor)', value: 'g-robot-api-123'},
        {name: 'Read Token (Viewer)', value: 'g-robot-read-456'},
      ],
      message: 'Select token to delete:',
    })
  })

  test('handles tokens with multiple roles', async () => {
    const {confirm, select} = await import('@sanity/cli-core/ux')
    const multiRoleRobot = createRobot({
      id: 'g-robot-multi-123',
      label: 'Multi Role Token',
      memberships: [
        {
          addedAt: '2023-01-01T00:00:00.000Z',
          resourceId: testProjectId,
          resourceType: 'project',
          roleNames: ['editor', 'viewer'],
        },
      ],
    })
    vi.mocked(select).mockResolvedValue('g-robot-multi-123')
    vi.mocked(confirm).mockResolvedValue(true)

    mockRobotsApi().reply(200, {data: [multiRoleRobot], nextCursor: null})
    mockRolesApi().reply(200, {data: mockRoles, nextCursor: null})
    mockDeleteRobotApi('g-robot-multi-123').reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(stdout).toBe('API token deleted\n')
    expect(select).toHaveBeenCalledWith({
      choices: [{name: 'Multi Role Token (Editor, Viewer)', value: 'g-robot-multi-123'}],
      message: 'Select token to delete:',
    })
  })

  test('handles tokens with no roles', async () => {
    const {confirm, select} = await import('@sanity/cli-core/ux')
    const noRoleRobot = createRobot({
      id: 'g-robot-no-role-123',
      label: 'No Role Token',
      memberships: [
        {
          addedAt: '2023-01-01T00:00:00.000Z',
          resourceId: testProjectId,
          resourceType: 'project',
          roleNames: [],
        },
      ],
    })
    vi.mocked(select).mockResolvedValue('g-robot-no-role-123')
    vi.mocked(confirm).mockResolvedValue(true)

    mockRobotsApi().reply(200, {data: [noRoleRobot], nextCursor: null})
    mockRolesApi().reply(200, {data: mockRoles, nextCursor: null})
    mockDeleteRobotApi('g-robot-no-role-123').reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(stdout).toBe('API token deleted\n')
    expect(select).toHaveBeenCalledWith({
      choices: [{name: 'No Role Token ()', value: 'g-robot-no-role-123'}],
      message: 'Select token to delete:',
    })
  })

  test('throws error when no tokens exist in project', async () => {
    mockRobotsApi().reply(200, {data: [], nextCursor: null})

    const {error} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe('No API tokens found for this project.')
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    {desc: 'when deleting token', message: 'Internal Server Error', statusCode: 500},
    {desc: 'with forbidden error when deleting token', message: 'Forbidden', statusCode: 403},
  ])('handles API error $desc', async ({message, statusCode}) => {
    mockDeleteRobotApi('g-robot-api-123').reply(statusCode, {message})

    const {error} = await testCommand(DeleteTokensCommand, ['g-robot-api-123', '--yes'], {
      mocks: defaultMocks,
    })
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token deletion failed')
    expect(error?.message).toContain(message)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API error when fetching tokens', async () => {
    mockRobotsApi().reply(404, {message: 'Project not found'})

    const {error} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Could not list API tokens')
    expect(error?.message).toContain('Project not found')
    expect(error?.message).toContain('Check the project ID and your access permissions')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API error with server error when fetching tokens', async () => {
    mockRobotsApi().reply(500, {message: 'Internal Server Error'})

    const {error} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Could not list API tokens')
    expect(error?.message).toContain('Internal Server Error')
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    {desc: 'no project ID is found', projectId: undefined},
    {desc: 'project ID is empty string', projectId: ''},
  ])('throws error when $desc', async ({projectId}) => {
    const {error} = await testCommand(DeleteTokensCommand, ['g-robot-api-123'], {
      mocks: {
        ...defaultMocks,
        cliConfig: {api: {projectId}},
      },
    })
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Unable to determine project ID')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles network errors when fetching tokens', async () => {
    // Don't set up any mock to simulate network failure
    const {error} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Could not list API tokens')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles network errors when deleting token', async () => {
    // Don't set up any mock to simulate network failure
    const {error} = await testCommand(DeleteTokensCommand, ['g-robot-api-123', '--yes'], {
      mocks: defaultMocks,
    })
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token deletion failed')
    expect(error?.oclif?.exit).toBe(1)
  })
})

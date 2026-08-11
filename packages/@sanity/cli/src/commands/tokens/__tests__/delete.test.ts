import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {TOKENS_API_VERSION} from '../../../actions/tokens/constants.js'
import {type Robot} from '../../../actions/tokens/types.js'
import {DeleteTokensCommand} from '../delete.js'

const testProjectId = 'test-project'

// Test fixtures
const createRobot = (overrides: {id: string; label?: string; roleNames?: string[]}): Robot => ({
  createdAt: '2023-01-01T00:00:00Z',
  id: overrides.id,
  label: overrides.label ?? 'Test Token',
  memberships: [
    {
      lastSeenAt: null,
      resourceId: testProjectId,
      resourceType: 'project',
      resourceUserId: 'user-123',
      roleNames: overrides.roleNames ?? ['editor'],
    },
  ],
  tokenId: `${overrides.id}-active-token`,
})

const TEST_ROBOTS = {
  API_TOKEN: createRobot({
    id: 'token-api-123',
    label: 'API Token',
    roleNames: ['editor'],
  }),
  READ_TOKEN: createRobot({
    id: 'token-read-456',
    label: 'Read Token',
    roleNames: ['viewer'],
  }),
} as const

function robotsPage(robots: Robot[]) {
  return {data: robots, nextCursor: null}
}

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

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/access/project/test-project/robots/token-api-123',
    }).reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, ['token-api-123'], {
      mocks: defaultMocks,
    })
    expect(stdout).toBe('API token deleted\n')
    expect(confirm).toHaveBeenCalledWith({
      default: false,
      message: 'Delete API token "token-api-123"?',
    })
  })

  test('deletes a specific token by ID with --yes flag (skips confirmation)', async () => {
    const {confirm} = await import('@sanity/cli-core/ux')
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/access/project/test-project/robots/token-api-123',
    }).reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, ['token-api-123', '--yes'], {
      mocks: defaultMocks,
    })
    expect(stdout).toBe('API token deleted\n')
    expect(confirm).not.toHaveBeenCalled()
  })

  test('deletes a specific token by ID with -y flag (skips confirmation)', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/access/project/test-project/robots/token-api-123',
    }).reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, ['token-api-123', '-y'], {
      mocks: defaultMocks,
    })
    expect(stdout).toBe('API token deleted\n')
  })

  test('cancels deletion when user declines confirmation', async () => {
    const {confirm} = await import('@sanity/cli-core/ux')
    vi.mocked(confirm).mockResolvedValue(false)

    const {error, stdout} = await testCommand(DeleteTokensCommand, ['token-api-123'], {
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

    const missingConfirmation = await testCommand(DeleteTokensCommand, ['token-api-123'], {
      mocks: {...defaultMocks, isInteractive: false},
    })
    expect(missingConfirmation.error?.message).toContain('--yes')
    expect(missingConfirmation.error?.oclif?.exit).toBe(exitCodes.USAGE_ERROR)
    expect(confirm).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  test('prompts user to select token when none specified', async () => {
    const {confirm, select} = await import('@sanity/cli-core/ux')
    vi.mocked(select).mockResolvedValue('token-read-456')
    vi.mocked(confirm).mockResolvedValue(true)

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/robots',
    }).reply(200, robotsPage([TEST_ROBOTS.API_TOKEN, TEST_ROBOTS.READ_TOKEN]))

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/access/project/test-project/robots/token-read-456',
    }).reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(stdout).toBe('API token deleted\n')
    expect(select).toHaveBeenCalledWith({
      choices: [
        {name: 'API Token (editor)', value: 'token-api-123'},
        {name: 'Read Token (viewer)', value: 'token-read-456'},
      ],
      message: 'Select token to delete:',
    })
  })

  test('handles tokens with multiple roles', async () => {
    const {confirm, select} = await import('@sanity/cli-core/ux')
    const multiRoleRobot = createRobot({
      id: 'token-multi-123',
      label: 'Multi Role Token',
      roleNames: ['editor', 'viewer'],
    })
    vi.mocked(select).mockResolvedValue('token-multi-123')
    vi.mocked(confirm).mockResolvedValue(true)

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/robots',
    }).reply(200, robotsPage([multiRoleRobot]))

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/access/project/test-project/robots/token-multi-123',
    }).reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(stdout).toBe('API token deleted\n')
    expect(select).toHaveBeenCalledWith({
      choices: [{name: 'Multi Role Token (editor, viewer)', value: 'token-multi-123'}],
      message: 'Select token to delete:',
    })
  })

  test('handles tokens with no roles', async () => {
    const {confirm, select} = await import('@sanity/cli-core/ux')
    const noRoleRobot = createRobot({
      id: 'token-no-role-123',
      label: 'No Role Token',
      roleNames: [],
    })
    vi.mocked(select).mockResolvedValue('token-no-role-123')
    vi.mocked(confirm).mockResolvedValue(true)

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/robots',
    }).reply(200, robotsPage([noRoleRobot]))

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/access/project/test-project/robots/token-no-role-123',
    }).reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(stdout).toBe('API token deleted\n')
    expect(select).toHaveBeenCalledWith({
      choices: [{name: 'No Role Token ()', value: 'token-no-role-123'}],
      message: 'Select token to delete:',
    })
  })

  test('throws error when token not found (404)', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/access/project/test-project/robots/nonexistent-token',
    }).reply(404, {message: 'Token not found'})

    const {error} = await testCommand(DeleteTokensCommand, ['nonexistent-token', '--yes'], {
      mocks: defaultMocks,
    })
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token with ID "nonexistent-token" not found')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('throws error when no tokens exist in project', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/robots',
    }).reply(200, robotsPage([]))

    const {error} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe('No API tokens found for this project.')
    expect(error?.oclif?.exit).toBe(1)
  })

  test.each([
    {desc: 'when deleting token', message: 'Internal Server Error', statusCode: 500},
    {desc: 'with forbidden error when deleting token', message: 'Forbidden', statusCode: 403},
  ])('handles API error $desc', async ({message, statusCode}) => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/access/project/test-project/robots/token-api-123',
    }).reply(statusCode, {message})

    const {error} = await testCommand(DeleteTokensCommand, ['token-api-123', '--yes'], {
      mocks: defaultMocks,
    })
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token deletion failed')
    expect(error?.message).toContain(message)
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API error when fetching tokens', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/robots',
    }).reply(404, {message: 'Project not found'})

    const {error} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Could not list API tokens')
    expect(error?.message).toContain('Project not found')
    expect(error?.message).toContain('Check the project ID and your access permissions')
    expect(error?.oclif?.exit).toBe(1)
  })

  test('handles API error with server error when fetching tokens', async () => {
    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/access/project/test-project/robots',
    }).reply(500, {message: 'Internal Server Error'})

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
    const {error} = await testCommand(DeleteTokensCommand, ['token-api-123'], {
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
    const {error} = await testCommand(DeleteTokensCommand, ['token-api-123', '--yes'], {
      mocks: defaultMocks,
    })
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Token deletion failed')
    expect(error?.oclif?.exit).toBe(1)
  })
})

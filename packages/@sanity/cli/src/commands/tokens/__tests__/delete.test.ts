import {mockApi, testCommand} from '@sanity/cli-test'
import {cleanAll, pendingMocks} from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {TOKENS_API_VERSION} from '../../../actions/tokens/constants.js'
import {type Token} from '../../../actions/tokens/types.js'
import {DeleteTokensCommand} from '../delete.js'

// Test fixtures
const createToken = (overrides: Partial<Token> & {id: string}): Token => ({
  createdAt: '2023-01-01T00:00:00Z',
  createdBy: 'user-creator',
  label: 'Test Token',
  lastUsedAt: null,
  permissions: ['read', 'write'],
  projectId: 'test-project',
  projectUserId: 'user-123',
  roles: [{name: 'editor', title: 'Editor'}],
  ...overrides,
})

const TEST_TOKENS = {
  API_TOKEN: createToken({
    id: 'token-api-123',
    label: 'API Token',
    roles: [{name: 'editor', title: 'Editor'}],
  }),
  READ_TOKEN: createToken({
    id: 'token-read-456',
    label: 'Read Token',
    roles: [{name: 'viewer', title: 'Viewer'}],
  }),
  WRITE_TOKEN: createToken({
    id: 'token-write-789',
    label: 'Write Token',
    roles: [{name: 'administrator', title: 'Administrator'}],
  }),
} as const

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
      uri: '/projects/test-project/tokens/token-api-123',
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
      uri: '/projects/test-project/tokens/token-api-123',
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
      uri: '/projects/test-project/tokens/token-api-123',
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
    expect(error?.oclif?.exit).toBe(3)
    expect(stdout).toBe('API token not deleted\n')
  })

  test('requires a token ID and --yes in unattended mode', async () => {
    const {confirm, select} = await import('@sanity/cli-core/ux')
    const missingId = await testCommand(DeleteTokensCommand, [], {
      mocks: {...defaultMocks, isInteractive: false},
    })
    expect(missingId.error?.message).toContain('<tokenId>')
    expect(missingId.error?.oclif?.exit).toBe(2)

    const missingConfirmation = await testCommand(DeleteTokensCommand, ['token-api-123'], {
      mocks: {...defaultMocks, isInteractive: false},
    })
    expect(missingConfirmation.error?.message).toContain('--yes')
    expect(missingConfirmation.error?.oclif?.exit).toBe(2)
    expect(confirm).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  test('prompts user to select token when none specified', async () => {
    const {confirm, select} = await import('@sanity/cli-core/ux')
    vi.mocked(select).mockResolvedValue('token-read-456')
    vi.mocked(confirm).mockResolvedValue(true)

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/projects/test-project/tokens',
    }).reply(200, [TEST_TOKENS.API_TOKEN, TEST_TOKENS.READ_TOKEN])

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/tokens/token-read-456',
    }).reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(stdout).toBe('API token deleted\n')
    expect(select).toHaveBeenCalledWith({
      choices: [
        {name: 'API Token (Editor)', value: 'token-api-123'},
        {name: 'Read Token (Viewer)', value: 'token-read-456'},
      ],
      message: 'Select token to delete:',
    })
  })

  test('handles tokens with multiple roles', async () => {
    const {confirm, select} = await import('@sanity/cli-core/ux')
    const multiRoleToken = createToken({
      id: 'token-multi-123',
      label: 'Multi Role Token',
      roles: [
        {name: 'editor', title: 'Editor'},
        {name: 'viewer', title: 'Viewer'},
      ],
    })
    vi.mocked(select).mockResolvedValue('token-multi-123')
    vi.mocked(confirm).mockResolvedValue(true)

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/projects/test-project/tokens',
    }).reply(200, [multiRoleToken])

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/tokens/token-multi-123',
    }).reply(204)

    const {stdout} = await testCommand(DeleteTokensCommand, [], {mocks: defaultMocks})
    expect(stdout).toBe('API token deleted\n')
    expect(select).toHaveBeenCalledWith({
      choices: [{name: 'Multi Role Token (Editor, Viewer)', value: 'token-multi-123'}],
      message: 'Select token to delete:',
    })
  })

  test('handles tokens with no roles', async () => {
    const {confirm, select} = await import('@sanity/cli-core/ux')
    const noRoleToken = createToken({
      id: 'token-no-role-123',
      label: 'No Role Token',
      roles: [],
    })
    vi.mocked(select).mockResolvedValue('token-no-role-123')
    vi.mocked(confirm).mockResolvedValue(true)

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      uri: '/projects/test-project/tokens',
    }).reply(200, [noRoleToken])

    mockApi({
      apiVersion: TOKENS_API_VERSION,
      method: 'delete',
      uri: '/projects/test-project/tokens/token-no-role-123',
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
      uri: '/projects/test-project/tokens/nonexistent-token',
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
      uri: '/projects/test-project/tokens',
    }).reply(200, [])

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
      uri: '/projects/test-project/tokens/token-api-123',
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
      uri: '/projects/test-project/tokens',
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
      uri: '/projects/test-project/tokens',
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

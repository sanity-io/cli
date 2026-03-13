import {getCliToken, getCliUserConfig, ProjectRootNotFoundError} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {findSanityModulesVersions} from '../../actions/versions/findSanityModulesVersions.js'
import {PROJECTS_API_VERSION} from '../../services/projects.js'
import {USERS_API_VERSION} from '../../services/user.js'
import {Debug} from '../debug.js'

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    getCliToken: vi.fn(),
    getCliUserConfig: vi.fn(),
  }
})

vi.mock('../../actions/versions/findSanityModulesVersions.js', () => ({
  findSanityModulesVersions: vi.fn(),
}))

const defaultProjectRoot = {
  directory: '/test/project',
  path: '/test/project/sanity.cli.ts',
  type: 'studio' as const,
}

const defaultCliConfig = {
  api: {
    projectId: 'project123',
  },
}

const defaultMocks = {
  cliConfig: defaultCliConfig,
  projectRoot: defaultProjectRoot,
  token: 'mock-auth-token',
}

afterEach(() => {
  vi.clearAllMocks()
  const pending = nock.pendingMocks()
  nock.cleanAll()
  expect(pending, 'pending mocks').toEqual([])
})

describe('#debug', () => {
  test('shows debug information with authentication and config details', async () => {
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      if (key === 'telemetryConsent')
        return {
          updatedAt: 1_234_567_890,
          value: {status: 'granted', type: 'explicit'},
        }
      return undefined
    })

    vi.mocked(findSanityModulesVersions).mockResolvedValue([
      {
        declared: '^3.0.0',
        installed: '3.0.0',
        isGlobal: false,
        isPinned: false,
        latest: '3.0.0',
        name: 'sanity',
        needsUpdate: false,
      },
      {
        declared: '^3.0.0',
        installed: '3.0.0',
        isGlobal: false,
        isPinned: false,
        latest: '3.1.0',
        name: '@sanity/cli',
        needsUpdate: true,
      },
    ])

    const {stdout} = await testCommand(Debug, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            dataset: 'production',
            projectId: 'project123',
          },
        },
      },
    })

    expect(stdout).toContain('User:')
    expect(stdout).toContain('Authentication:')
    expect(stdout).toContain('<redacted>')
    expect(stdout).toContain('Global config')
    expect(stdout).toContain('Package versions:')
    expect(stdout).toContain('sanity')
    expect(stdout).toContain('3.0.0')
    expect(stdout).toContain('(up to date)')
    expect(stdout).toContain('(latest: 3.1.0)')
  })

  test('shows redacted auth token by default', async () => {
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    const {stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

    expect(stdout).toContain('<redacted>')
    expect(stdout).toContain('(run with --secrets to reveal token)')
    expect(stdout).not.toContain('mock-auth-token')
  })

  test('shows actual auth token with --secrets flag', async () => {
    vi.mocked(getCliToken).mockResolvedValue('secret-token-12345')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'secret-token-12345'
      return undefined
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    const {stdout} = await testCommand(Debug, ['--secrets'], {
      mocks: {
        ...defaultMocks,
        token: 'secret-token-12345',
      },
    })

    expect(stdout).toContain('secret-token-12345')
    expect(stdout).not.toContain('<redacted>')
    expect(stdout).not.toContain('(run with --secrets to reveal token)')
  })

  test('handles unauthenticated user', async () => {
    vi.mocked(getCliToken).mockResolvedValue(undefined)
    vi.mocked(getCliUserConfig).mockImplementation(async () => undefined)
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    const {stdout} = await testCommand(Debug, [], {
      mocks: {
        ...defaultMocks,
        token: undefined,
      },
    })

    expect(stdout).toContain('User:')
    expect(stdout).toContain('Not logged in')
  })

  test('shows package versions with update information', async () => {
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    vi.mocked(findSanityModulesVersions).mockResolvedValue([
      {
        declared: '^3.0.0',
        installed: '3.0.0',
        isGlobal: false,
        isPinned: false,
        latest: '3.0.0',
        name: 'sanity',
        needsUpdate: false,
      },
      {
        declared: '^2.9.0',
        installed: '2.9.0',
        isGlobal: false,
        isPinned: false,
        latest: '3.1.0',
        name: '@sanity/cli',
        needsUpdate: true,
      },
      {
        declared: '^3.0.0',
        installed: undefined,
        isGlobal: false,
        isPinned: false,
        latest: '3.0.0',
        name: '@sanity/types',
        needsUpdate: true,
      },
    ])

    const {stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

    expect(stdout).toContain('Package versions:')
    expect(stdout).toContain('sanity')
    expect(stdout).toContain('3.0.0')
    expect(stdout).toContain('(up to date)')
    expect(stdout).toContain('(latest: 3.1.0)')
    expect(stdout).toContain('<missing>')
  })

  test('handles errors gracefully', async () => {
    vi.mocked(getCliToken).mockRejectedValue(new Error('Auth system unavailable'))

    const {error} = await testCommand(Debug, [], {mocks: defaultMocks})

    expect(error?.message).toContain('Failed to gather debug information')
    expect(error?.message).toContain('Auth system unavailable')
  })

  test('displays user information when user is present', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({
      apiVersion: USERS_API_VERSION,
      projectId: 'project123',
      uri: '/users/me',
    }).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return no project (404)
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      projectId: 'project123',
      uri: '/projects/project123',
    }).reply(404)

    const {stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

    expect(stdout).toContain('User:')
    expect(stdout).toContain("Email: 'test@example.com'")
    expect(stdout).toContain("ID: 'user123'")
    expect(stdout).toContain("Name: 'Test User'")
  })

  test('displays project information when project is present', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({
      apiVersion: USERS_API_VERSION,
      projectId: 'project123',
      uri: '/users/me',
    }).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return project info
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      projectId: 'project123',
      uri: '/projects/project123',
    }).reply(200, {
      displayName: 'Test Project',
      id: 'project123',
      members: [
        {
          id: 'user123',
          roles: [{name: 'administrator'}],
        },
      ],
      studioHost: 'test-project',
    })

    const {stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

    expect(stdout).toContain('Project:')
    expect(stdout).toContain("Display name: 'Test Project'")
    expect(stdout).toContain("ID: 'project123'")
    expect(stdout).toContain("Roles: [ 'administrator' ]")
  })

  test('handles case when no project config is present', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    // Uses global API host since there's no projectId
    mockApi({apiVersion: USERS_API_VERSION, uri: '/users/me'}).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // No project API mock needed since no valid projectId

    const {stdout} = await testCommand(Debug, [], {
      mocks: {
        ...defaultMocks,
        cliConfig: {
          api: {
            // No projectId - this will cause project config to be invalid
          },
        },
      },
    })

    expect(stdout).toContain('Global config')
    expect(stdout).toContain('Project config')
    expect(stdout).toContain('Missing required "api.projectId" key')
  })

  test('handles case when no versions are present', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })
    // Mock findSanityModulesVersions to return empty array (no versions)
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({
      apiVersion: USERS_API_VERSION,
      projectId: 'project123',
      uri: '/users/me',
    }).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return project info
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      projectId: 'project123',
      uri: '/projects/project123',
    }).reply(200, {
      displayName: 'Test Project',
      id: 'project123',
      members: [
        {
          id: 'user123',
          roles: [{name: 'administrator'}],
        },
      ],
      studioHost: 'test-project',
    })

    const {stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

    expect(stdout).toContain('Global config')
    expect(stdout).toContain('Package versions:')
    // Should show the heading but no packages since the array is empty
  })

  test('handles error case with unknown error type', async () => {
    // Mock getCliToken to throw a non-Error object to trigger unknown error path
    vi.mocked(getCliToken).mockRejectedValue('string error')

    const {error} = await testCommand(Debug, [], {mocks: defaultMocks})

    expect(error).toBeTruthy()
    expect(error?.message).toContain('Failed to gather debug information')
    expect(error?.message).toContain('Unknown error')
  })

  test('handles global config error gracefully', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    // Mock getCliUserConfig to throw an error
    vi.mocked(getCliUserConfig).mockRejectedValue(new Error('Config access error'))
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({
      apiVersion: USERS_API_VERSION,
      projectId: 'project123',
      uri: '/users/me',
    }).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return project info
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      projectId: 'project123',
      uri: '/projects/project123',
    }).reply(200, {
      displayName: 'Test Project',
      id: 'project123',
      members: [],
      studioHost: 'test-project',
    })

    const {stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

    // Should continue to work despite global config error
    expect(stdout).toContain('Global config')
    expect(stdout).toContain('User:')
    expect(stdout).toContain('Project:')
  })

  test('handles user API error and shows error message', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return an error
    mockApi({
      apiVersion: USERS_API_VERSION,
      projectId: 'project123',
      uri: '/users/me',
    }).reply(500, {
      error: 'Internal server error',
    })

    const {stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

    expect(stdout).toContain('User:')
    // Should show error message in red
    expect(stdout).toMatch(
      /Request failed with status code 500|Failed to fetch user info|Internal server error/,
    )
  })

  test('handles project API error and continues gracefully', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({
      apiVersion: USERS_API_VERSION,
      projectId: 'project123',
      uri: '/users/me',
    }).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return an error
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      projectId: 'project123',
      uri: '/projects/project123',
    }).reply(404, {
      error: 'Project not found',
    })

    const {stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

    expect(stdout).toContain('User:')
    expect(stdout).toContain("Email: 'test@example.com'")
    // Should not contain Project section since it failed to load
    expect(stdout).not.toContain('Project:')
  })

  test('handles project with null response and shows error', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({
      apiVersion: USERS_API_VERSION,
      projectId: 'project123',
      uri: '/users/me',
    }).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return null
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      projectId: 'project123',
      uri: '/projects/project123',
    }).reply(200, () => {
      return null
    })

    const {stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

    expect(stdout).toContain('User:')
    expect(stdout).toContain("Email: 'test@example.com'")
    // Project error is handled internally but not displayed to user
    expect(stdout).not.toContain('Project:')
  })

  test('handles project with no members array gracefully', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({
      apiVersion: USERS_API_VERSION,
      projectId: 'project123',
      uri: '/users/me',
    }).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return project with no members
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      projectId: 'project123',
      uri: '/projects/project123',
    }).reply(200, {
      displayName: 'Test Project',
      id: 'project123',
      studioHost: 'test-project',
      // No members array
    })

    const {stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

    expect(stdout).toContain('Project:')
    expect(stdout).toContain("Display name: 'Test Project'")
    expect(stdout).toContain("Roles: [ '<none>' ]")
  })

  test('works outside a project directory (no project root)', async () => {
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint (uses global API host since no project)
    mockApi({apiVersion: USERS_API_VERSION, uri: '/users/me'}).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    const {error, stdout} = await testCommand(Debug, [], {
      mocks: {
        cliConfigError: new ProjectRootNotFoundError('No project root found'),
        token: 'mock-auth-token',
      },
    })

    if (error) throw error
    expect(stdout).toContain('User:')
    expect(stdout).toContain("Email: 'test@example.com'")
    expect(stdout).toContain('Authentication:')
    expect(stdout).toContain('Global config')
    // Should NOT contain project-specific sections
    expect(stdout).not.toContain('Project:')
    expect(stdout).not.toContain('Project config')
    expect(stdout).not.toContain('Package versions:')
  })

  test('works outside a project directory when not logged in', async () => {
    vi.mocked(getCliToken).mockResolvedValue(undefined)
    vi.mocked(getCliUserConfig).mockImplementation(async () => undefined)
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    const {error, stdout} = await testCommand(Debug, [], {
      mocks: {
        cliConfigError: new ProjectRootNotFoundError('No project root found'),
        token: undefined,
      },
    })

    if (error) throw error
    expect(stdout).toContain('User:')
    expect(stdout).toContain('Not logged in')
    expect(stdout).toContain('Global config')
    expect(stdout).not.toContain('Authentication:')
    expect(stdout).not.toContain('Project:')
    expect(stdout).not.toContain('Package versions:')
  })

  test('handles project member with no roles gracefully', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getCliUserConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({
      apiVersion: USERS_API_VERSION,
      projectId: 'project123',
      uri: '/users/me',
    }).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return project with member but no roles
    mockApi({
      apiVersion: PROJECTS_API_VERSION,
      projectId: 'project123',
      uri: '/projects/project123',
    }).reply(200, {
      displayName: 'Test Project',
      id: 'project123',
      members: [
        {
          id: 'user123',
          // No roles property
        },
      ],
      studioHost: 'test-project',
    })

    const {stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

    expect(stdout).toContain('Project:')
    expect(stdout).toContain("Display name: 'Test Project'")
    expect(stdout).toContain("Roles: [ '<none>' ]")
  })
})

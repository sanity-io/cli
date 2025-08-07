import {runCommand} from '@oclif/test'
import {findProjectRoot, getCliConfig, getCliToken, getConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {findSanityModulesVersions} from '../../actions/versions/findSanityModulesVersions.js'
import {Debug} from '../debug.js'

// Mock CLI core functions using relative paths
vi.mock('../../../../cli-core/src/services/getCliToken.js', () => ({
  getCliToken: vi.fn(),
}))

vi.mock('../../../../cli-core/src/services/cliUserConfig.js', () => ({
  getConfig: vi.fn(),
}))

vi.mock('../../../../cli-core/src/config/findProjectRoot.js', () => ({
  findProjectRoot: vi.fn(),
}))

// Mock the CLI config function like in manage.test.ts
vi.mock('../../../../cli-core/src/config/cli/getCliConfig.js', () => ({
  getCliConfig: vi.fn(),
}))

// Mock version-related functions
vi.mock('../../actions/versions/findSanityModulesVersions.js', () => ({
  findSanityModulesVersions: vi.fn(),
}))

afterEach(() => {
  vi.clearAllMocks()
  const pending = nock.pendingMocks()
  nock.cleanAll()
  expect(pending, 'pending mocks').toEqual([])
})

describe('#debug', () => {
  test('help text is correct', async () => {
    const {stdout} = await runCommand('debug --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Provides diagnostic info for Sanity Studio troubleshooting

      USAGE
        $ sanity debug [--secrets]

      FLAGS
        --secrets  Include API keys in output

      DESCRIPTION
        Provides diagnostic info for Sanity Studio troubleshooting

      EXAMPLES
        $ sanity debug

        $ sanity debug --secrets

      "
    `)
  })

  test('shows debug information with authentication and config details', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      if (key === 'telemetryConsent')
        return {
          updatedAt: 1_234_567_890,
          value: {status: 'granted', type: 'explicit'},
        }
      return undefined
    })

    // Mock project configuration
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        dataset: 'production',
        projectId: 'project123',
      },
    })

    // Mock version info with some packages
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

    const {stdout} = await testCommand(Debug, [])

    // Check that basic debug output structure is present
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
    // Mock basic authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    // Mock minimal project setup
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    const {stdout} = await testCommand(Debug, [])

    expect(stdout).toContain('<redacted>')
    expect(stdout).toContain('(run with --secrets to reveal token)')
    expect(stdout).not.toContain('mock-auth-token')
  })

  test('shows actual auth token with --secrets flag', async () => {
    // Mock authentication with specific token
    vi.mocked(getCliToken).mockResolvedValue('secret-token-12345')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'secret-token-12345'
      return undefined
    })

    // Mock minimal project setup
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    const {stdout} = await testCommand(Debug, ['--secrets'])

    expect(stdout).toContain('secret-token-12345')
    expect(stdout).not.toContain('<redacted>')
    expect(stdout).not.toContain('(run with --secrets to reveal token)')
  })

  test('handles unauthenticated user', async () => {
    // Mock no authentication
    vi.mocked(getCliToken).mockResolvedValue(undefined)
    vi.mocked(getConfig).mockImplementation(async () => undefined)

    const {error} = await testCommand(Debug, [])

    // When not authenticated, the command should error trying to get client
    expect(error?.message).toContain('Failed to gather debug information')
  })

  test('shows package versions with update information', async () => {
    // Mock basic authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    // Mock project setup
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })

    // Mock version info with mixed update statuses
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

    const {stdout} = await testCommand(Debug, [])

    expect(stdout).toContain('Package versions:')
    expect(stdout).toContain('sanity')
    expect(stdout).toContain('3.0.0')
    expect(stdout).toContain('(up to date)')
    expect(stdout).toContain('(latest: 3.1.0)')
    expect(stdout).toContain('<missing>')
  })

  test('handles errors gracefully', async () => {
    vi.mocked(getCliToken).mockRejectedValue(new Error('Auth system unavailable'))

    const {error} = await testCommand(Debug, [])

    expect(error?.message).toContain('Failed to gather debug information')
    expect(error?.message).toContain('Auth system unavailable')
  })

  test('displays user information when user is present', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    // Mock project configuration but no project info from API
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({apiVersion: 'v2025-08-06', uri: '/users/me'}).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return no project (404)
    mockApi({apiVersion: 'v2025-08-06', uri: '/projects/project123'}).reply(404)

    const {stdout} = await testCommand(Debug, [])

    expect(stdout).toContain('User:')
    expect(stdout).toContain("Email: 'test@example.com'")
    expect(stdout).toContain("ID: 'user123'")
    expect(stdout).toContain("Name: 'Test User'")
  })

  test('displays project information when project is present', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    // Mock project configuration
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({apiVersion: 'v2025-08-06', uri: '/users/me'}).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return project info
    mockApi({apiVersion: 'v2025-08-06', uri: '/projects/project123'}).reply(200, {
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

    const {stdout} = await testCommand(Debug, [])

    expect(stdout).toContain('Project:')
    expect(stdout).toContain("Display name: 'Test Project'")
    expect(stdout).toContain("ID: 'project123'")
    expect(stdout).toContain("Roles: [ 'administrator' ]")
  })

  test('handles case when no auth token is present', async () => {
    // Mock no authentication
    vi.mocked(getCliToken).mockResolvedValue(undefined)
    vi.mocked(getConfig).mockImplementation(async () => undefined)

    // Mock project configuration
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Command should fail when no auth token is present since it requires authentication
    const {error} = await testCommand(Debug, [])

    expect(error?.message).toContain('Failed to gather debug information')
  })

  test('handles case when no project config is present', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    // Mock project configuration with no projectId (invalid config)
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        // No projectId - this will cause project config to be invalid
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({apiVersion: 'v2025-08-06', uri: '/users/me'}).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // No project API mock needed since no valid projectId

    const {stdout} = await testCommand(Debug, [])

    expect(stdout).toContain('Global config')
    expect(stdout).toContain('Project config')
    expect(stdout).toContain('Missing required "api.projectId" key')
  })

  test('handles case when no versions are present', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    // Mock project configuration
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    // Mock findSanityModulesVersions to return empty array (no versions)
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({apiVersion: 'v2025-08-06', uri: '/users/me'}).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return project info
    mockApi({apiVersion: 'v2025-08-06', uri: '/projects/project123'}).reply(200, {
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

    const {stdout} = await testCommand(Debug, [])

    expect(stdout).toContain('Global config')
    expect(stdout).toContain('Package versions:')
    // Should show the heading but no packages since the array is empty
  })

  test('handles error case with unknown error type', async () => {
    // Mock project configuration
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })

    // Mock getCliToken to throw a non-Error object to trigger unknown error path
    vi.mocked(getCliToken).mockRejectedValue('string error')

    const {error} = await testCommand(Debug, [])

    expect(error).toBeTruthy()
    expect(error?.message).toContain('Failed to gather debug information')
    expect(error?.message).toContain('Unknown error')
  })

  test('handles global config error gracefully', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    // Mock getConfig to throw an error
    vi.mocked(getConfig).mockRejectedValue(new Error('Config access error'))

    // Mock project configuration
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({apiVersion: 'v2025-08-06', uri: '/users/me'}).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return project info
    mockApi({apiVersion: 'v2025-08-06', uri: '/projects/project123'}).reply(200, {
      displayName: 'Test Project',
      id: 'project123',
      members: [],
      studioHost: 'test-project',
    })

    const {stdout} = await testCommand(Debug, [])

    // Should continue to work despite global config error
    expect(stdout).toContain('Global config')
    expect(stdout).toContain('User:')
    expect(stdout).toContain('Project:')
  })

  test('handles user API error and shows error message', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    // Mock project configuration
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return an error
    mockApi({apiVersion: 'v2025-08-06', uri: '/users/me'}).reply(500, {
      error: 'Internal server error',
    })

    const {stdout} = await testCommand(Debug, [])

    expect(stdout).toContain('User:')
    // Should show error message in red
    expect(stdout).toMatch(
      /Request failed with status code 500|Failed to fetch user info|Internal server error/,
    )
  })

  test('handles null user response and shows error message', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    // Mock project configuration
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return null
    mockApi({apiVersion: 'v2025-08-06', uri: '/users/me'}).reply(200, (_uri, _requestBody) => {
      return null
    })

    const {stdout} = await testCommand(Debug, [])

    expect(stdout).toContain('User:')
    expect(stdout).toContain('Token expired or invalid')
  })

  test('handles project API error and continues gracefully', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    // Mock project configuration
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({apiVersion: 'v2025-08-06', uri: '/users/me'}).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return an error
    mockApi({apiVersion: 'v2025-08-06', uri: '/projects/project123'}).reply(404, {
      error: 'Project not found',
    })

    const {stdout} = await testCommand(Debug, [])

    expect(stdout).toContain('User:')
    expect(stdout).toContain("Email: 'test@example.com'")
    // Should not contain Project section since it failed to load
    expect(stdout).not.toContain('Project:')
  })

  test('handles project with null response and shows error', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    // Mock project configuration
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({apiVersion: 'v2025-08-06', uri: '/users/me'}).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return null
    mockApi({apiVersion: 'v2025-08-06', uri: '/projects/project123'}).reply(200, () => {
      return null
    })

    const {stdout} = await testCommand(Debug, [])

    expect(stdout).toContain('User:')
    expect(stdout).toContain("Email: 'test@example.com'")
    // Project error is handled internally but not displayed to user
    expect(stdout).not.toContain('Project:')
  })

  test('handles project with no members array gracefully', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    // Mock project configuration
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({apiVersion: 'v2025-08-06', uri: '/users/me'}).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return project with no members
    mockApi({apiVersion: 'v2025-08-06', uri: '/projects/project123'}).reply(200, {
      displayName: 'Test Project',
      id: 'project123',
      studioHost: 'test-project',
      // No members array
    })

    const {stdout} = await testCommand(Debug, [])

    expect(stdout).toContain('Project:')
    expect(stdout).toContain("Display name: 'Test Project'")
    expect(stdout).toContain("Roles: [ '<none>' ]")
  })

  test('handles project member with no roles gracefully', async () => {
    // Mock authentication
    vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
    vi.mocked(getConfig).mockImplementation(async (key: string) => {
      if (key === 'authToken') return 'mock-auth-token'
      return undefined
    })

    // Mock project configuration
    vi.mocked(findProjectRoot).mockResolvedValue({
      directory: '/test/project',
      path: '/test/project/sanity.cli.ts',
      type: 'studio',
    })
    vi.mocked(getCliConfig).mockResolvedValue({
      api: {
        projectId: 'project123',
      },
    })
    vi.mocked(findSanityModulesVersions).mockResolvedValue([])

    // Mock the /me API endpoint to return user info
    mockApi({apiVersion: 'v2025-08-06', uri: '/users/me'}).reply(200, {
      email: 'test@example.com',
      id: 'user123',
      name: 'Test User',
    })

    // Mock the project API endpoint to return project with member but no roles
    mockApi({apiVersion: 'v2025-08-06', uri: '/projects/project123'}).reply(200, {
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

    const {stdout} = await testCommand(Debug, [])

    expect(stdout).toContain('Project:')
    expect(stdout).toContain("Display name: 'Test Project'")
    expect(stdout).toContain("Roles: [ '<none>' ]")
  })
})

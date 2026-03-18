import {
  getCliToken,
  getStudioConfig,
  getUserConfig,
  ProjectRootNotFoundError,
  tryFindStudioConfigPath,
} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {PROJECTS_API_VERSION} from '../../services/projects.js'
import {USERS_API_VERSION} from '../../services/user.js'
import {Debug} from '../debug.js'

// Mock fs/promises for findCliConfigFile
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  }
})

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    getCliToken: vi.fn(),
    getStudioConfig: vi.fn(),
    getUserConfig: vi.fn().mockReturnValue({
      all: {},
      get: vi.fn().mockReturnValue(undefined),
      path: '/home/user/.config/sanity/config',
    }),
    tryFindStudioConfigPath: vi.fn(),
  }
})

vi.mock('../../util/getCliVersion.js', () => ({
  getCliVersion: vi.fn().mockResolvedValue('6.1.4'),
}))

vi.mock('../../util/packageManager/installationInfo/index.js', () => ({
  detectCliInstallation: vi.fn().mockResolvedValue({
    currentExecution: {
      binaryPath: '/usr/local/bin/sanity',
      packageManager: 'npm',
      resolvedFrom: 'global',
    },
    globalInstallations: [],
    issues: [],
    packages: {},
    workspace: {root: '/test/project', type: 'standalone'},
  }),
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
  describe('User section', () => {
    test('shows user info when logged in with project context', async () => {
      vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      mockApi({
        apiVersion: USERS_API_VERSION,
        projectId: 'project123',
        uri: '/users/me',
      }).reply(200, {
        email: 'test@example.com',
        id: 'user123',
        name: 'Test User',
        provider: 'google',
      })

      const {error, stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

      if (error) throw error
      expect(stdout).toContain('User:')
      expect(stdout).toContain('Test User')
      expect(stdout).toContain('test@example.com')
      expect(stdout).toContain('user123')
      expect(stdout).toContain('google')
    })

    test('shows "Not logged in" when no token', async () => {
      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          ...defaultMocks,
          token: undefined,
        },
      })

      if (error) throw error
      expect(stdout).toContain('User:')
      expect(stdout).toContain('Not logged in')
    })

    test('shows user info without project context (global client)', async () => {
      vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      // No project ID in config
      mockApi({
        apiVersion: USERS_API_VERSION,
        uri: '/users/me',
      }).reply(200, {
        email: 'global@example.com',
        id: 'globaluser',
        name: 'Global User',
        provider: 'sanity',
      })

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          cliConfig: {api: {}},
          projectRoot: defaultProjectRoot,
          token: 'mock-auth-token',
        },
      })

      if (error) throw error
      expect(stdout).toContain('Global User')
      expect(stdout).toContain('global@example.com')
    })

    test('handles user API error gracefully', async () => {
      vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      mockApi({
        apiVersion: USERS_API_VERSION,
        projectId: 'project123',
        uri: '/users/me',
      }).reply(500, {error: 'Internal server error'})

      const {error, stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

      if (error) throw error
      expect(stdout).toContain('User:')
      // Should show error message but not crash
      expect(stdout).toMatch(/500|Internal server error|Failed to fetch user info/)
    })
  })

  describe('Authentication section', () => {
    test('shows redacted auth token by default', async () => {
      vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      mockApi({
        apiVersion: USERS_API_VERSION,
        projectId: 'project123',
        uri: '/users/me',
      }).reply(200, {
        email: 'test@example.com',
        id: 'user123',
        name: 'Test User',
        provider: 'google',
      })

      const {error, stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

      if (error) throw error
      expect(stdout).toContain('Authentication:')
      expect(stdout).toContain('<redacted>')
      expect(stdout).toContain('(run with --secrets to reveal token)')
      expect(stdout).not.toContain('mock-auth-token')
    })

    test('shows actual auth token with --secrets flag', async () => {
      vi.mocked(getCliToken).mockResolvedValue('secret-token-12345')
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      mockApi({
        apiVersion: USERS_API_VERSION,
        projectId: 'project123',
        uri: '/users/me',
      }).reply(200, {
        email: 'test@example.com',
        id: 'user123',
        name: 'Test User',
        provider: 'google',
      })

      const {error, stdout} = await testCommand(Debug, ['--secrets'], {
        mocks: {
          ...defaultMocks,
          token: 'secret-token-12345',
        },
      })

      if (error) throw error
      expect(stdout).toContain('secret-token-12345')
      expect(stdout).not.toContain('<redacted>')
      expect(stdout).not.toContain('(run with --secrets to reveal token)')
    })

    test('does not show authentication section when not logged in', async () => {
      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          ...defaultMocks,
          token: undefined,
        },
      })

      if (error) throw error
      expect(stdout).not.toContain('Authentication:')
    })

    test('shows user type from global config', async () => {
      vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
      vi.mocked(getUserConfig).mockReturnValue({
        all: {authType: 'enterprise'},
        get: vi.fn().mockReturnValue('enterprise'),
        path: '/home/user/.config/sanity/config',
      } as never)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      mockApi({
        apiVersion: USERS_API_VERSION,
        projectId: 'project123',
        uri: '/users/me',
      }).reply(200, {
        email: 'test@example.com',
        id: 'user123',
        name: 'Test User',
        provider: 'google',
      })

      const {error, stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

      if (error) throw error
      expect(stdout).toContain('enterprise')
    })
  })

  describe('CLI section', () => {
    test('shows CLI version and install context', async () => {
      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          ...defaultMocks,
          token: undefined,
        },
      })

      if (error) throw error
      expect(stdout).toContain('CLI:')
      expect(stdout).toContain('6.1.4')
      expect(stdout).toContain('globally (npm)')
    })
  })

  describe('Project section', () => {
    test('shows "No project found" when outside project directory', async () => {
      vi.mocked(getCliToken).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          cliConfigError: new ProjectRootNotFoundError('No project root found'),
          token: undefined,
        },
      })

      if (error) throw error
      expect(stdout).toContain('Project:')
      expect(stdout).toContain('No project found')
    })

    test('shows project root path and config file detection', async () => {
      const {access: mockAccess} = await import('node:fs/promises')
      vi.mocked(mockAccess).mockImplementation(async (filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('sanity.cli.ts')) {
          return undefined
        }
        throw new Error('ENOENT')
      })

      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue('/test/project/sanity.config.ts')

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          ...defaultMocks,
          token: undefined,
        },
      })

      if (error) throw error
      expect(stdout).toContain('Project:')
      expect(stdout).toContain('/test/project')
      expect(stdout).toContain('sanity.cli.ts')
      expect(stdout).toContain('sanity.config.ts')
    })

    test('shows warning on CLI config line when config fails to load', async () => {
      const {access: mockAccess} = await import('node:fs/promises')
      vi.mocked(mockAccess).mockImplementation(async (filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('sanity.cli.ts')) {
          return undefined
        }
        throw new Error('ENOENT')
      })

      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          cliConfig: undefined,
          cliConfigError: new Error('Invalid CLI config: Expected object, received undefined'),
          projectRoot: defaultProjectRoot,
          token: undefined,
        },
      })

      if (error) throw error
      expect(stdout).toContain('Project:')
      expect(stdout).toContain('sanity.cli.ts')
      expect(stdout).toContain('has errors')
    })

    test('shows "not found" when config files are missing', async () => {
      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          ...defaultMocks,
          token: undefined,
        },
      })

      if (error) throw error
      expect(stdout).toContain('Project:')
      expect(stdout).toContain('not found')
    })
  })

  describe('Studio section', () => {
    test('shows studio workspaces when studio config exists', async () => {
      const {access: mockAccess} = await import('node:fs/promises')
      vi.mocked(mockAccess).mockRejectedValue(new Error('ENOENT'))

      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue('/test/project/sanity.config.ts')
      vi.mocked(getStudioConfig).mockResolvedValue({
        basePath: '/',
        dataset: 'production',
        name: 'default',
        plugins: [],
        projectId: 'abc123',
        schema: {types: []},
        title: 'My Studio',
        unstable_sources: [
          {dataset: 'production', projectId: 'abc123', schema: {_original: {types: []}}},
        ],
      } as never)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          ...defaultMocks,
          token: undefined,
        },
      })

      if (error) throw error
      expect(stdout).toContain('Studio:')
      expect(stdout).toContain('Workspaces:')
      expect(stdout).toContain('default')
      expect(stdout).toContain('abc123')
      expect(stdout).toContain('production')
    })

    test('does not show studio section when no studio config exists', async () => {
      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          ...defaultMocks,
          token: undefined,
        },
      })

      if (error) throw error
      expect(stdout).not.toContain('Studio:')
    })

    test('does not show studio section when outside project directory', async () => {
      vi.mocked(getCliToken).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          cliConfigError: new ProjectRootNotFoundError('No project root found'),
          token: undefined,
        },
      })

      if (error) throw error
      expect(stdout).not.toContain('Studio:')
    })

    test('shows multi-workspace studio config', async () => {
      const {access: mockAccess} = await import('node:fs/promises')
      vi.mocked(mockAccess).mockRejectedValue(new Error('ENOENT'))

      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue('/test/project/sanity.config.ts')
      vi.mocked(getStudioConfig).mockResolvedValue([
        {
          basePath: '/staging',
          dataset: 'staging',
          name: 'staging',
          projectId: 'abc123',
          title: 'Staging',
          unstable_sources: [
            {dataset: 'staging', projectId: 'abc123', schema: {_original: {types: []}}},
          ],
        },
        {
          basePath: '/production',
          dataset: 'production',
          name: 'production',
          projectId: 'abc123',
          title: 'Production',
          unstable_sources: [
            {dataset: 'production', projectId: 'abc123', schema: {_original: {types: []}}},
          ],
        },
      ] as never)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          ...defaultMocks,
          token: undefined,
        },
      })

      if (error) throw error
      expect(stdout).toContain('Studio:')
      expect(stdout).toContain('staging')
      expect(stdout).toContain('production')
    })

    test('shows warning on studio config line and error in Studio section when config fails', async () => {
      const {access: mockAccess} = await import('node:fs/promises')
      vi.mocked(mockAccess).mockRejectedValue(new Error('ENOENT'))

      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue('/test/project/sanity.config.ts')
      vi.mocked(getStudioConfig).mockRejectedValue(new Error('Config parse error'))

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          ...defaultMocks,
          token: undefined,
        },
      })

      if (error) throw error
      // Project section shows warning on the studio config line
      expect(stdout).toContain('sanity.config.ts')
      expect(stdout).toContain('has errors')
      // Studio section should appear with the error message
      expect(stdout).toContain('Studio:')
      expect(stdout).toContain('Config parse error')
      // But no workspaces
      expect(stdout).not.toContain('Workspaces:')
    })

    test('shows resolved configuration with roles when logged in', async () => {
      const {access: mockAccess} = await import('node:fs/promises')
      vi.mocked(mockAccess).mockRejectedValue(new Error('ENOENT'))

      vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue('/test/project/sanity.config.ts')

      // First call: raw config (resolvePlugins: false)
      // Second call: resolved config (resolvePlugins: true)
      vi.mocked(getStudioConfig)
        .mockResolvedValueOnce({
          basePath: '/',
          dataset: 'production',
          name: 'default',
          projectId: 'abc123',
          title: 'My Studio',
          unstable_sources: [
            {dataset: 'production', projectId: 'abc123', schema: {_original: {types: []}}},
          ],
        } as never)
        .mockResolvedValueOnce([
          {
            basePath: '/',
            dataset: 'production',
            name: 'default',
            projectId: 'abc123',
            title: 'My Studio',
            unstable_sources: [
              {dataset: 'production', projectId: 'abc123', schema: {_original: {types: []}}},
            ],
          },
        ] as never)

      // Mock user API (called twice - once for user section, once for studio section)
      mockApi({
        apiVersion: USERS_API_VERSION,
        projectId: 'project123',
        uri: '/users/me',
      })
        .reply(200, {
          email: 'test@example.com',
          id: 'user123',
          name: 'Test User',
          provider: 'google',
        })
        .persist()

      // Mock project API for role fetching
      mockApi({
        apiVersion: PROJECTS_API_VERSION,
        projectId: 'abc123',
        uri: '/projects/abc123',
      }).reply(200, {
        displayName: 'Test Project',
        id: 'abc123',
        members: [{id: 'user123', roles: [{name: 'administrator'}]}],
      })

      const {error, stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

      if (error) throw error
      expect(stdout).toContain('Resolved configuration:')
      expect(stdout).toContain('default (My Studio)')
      expect(stdout).toContain('administrator')
    })

    test('shows fallback message when full resolution fails', async () => {
      const {access: mockAccess} = await import('node:fs/promises')
      vi.mocked(mockAccess).mockRejectedValue(new Error('ENOENT'))

      vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue('/test/project/sanity.config.ts')

      // First call: raw config succeeds
      // Second call: resolved config fails
      vi.mocked(getStudioConfig)
        .mockResolvedValueOnce({
          basePath: '/',
          dataset: 'production',
          name: 'default',
          projectId: 'abc123',
          title: 'My Studio',
          unstable_sources: [
            {dataset: 'production', projectId: 'abc123', schema: {_original: {types: []}}},
          ],
        } as never)
        .mockRejectedValueOnce(new Error('Plugin resolution failed'))

      mockApi({
        apiVersion: USERS_API_VERSION,
        projectId: 'project123',
        uri: '/users/me',
      })
        .reply(200, {
          email: 'test@example.com',
          id: 'user123',
          name: 'Test User',
          provider: 'google',
        })
        .persist()

      const {error, stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

      if (error) throw error
      expect(stdout).toContain('Workspaces:')
      expect(stdout).toContain('unable to resolve full studio configuration')
      expect(stdout).toContain('Plugin resolution failed')
    })
  })

  describe('CLI install contexts', () => {
    test('shows "locally" when installed locally', async () => {
      const {detectCliInstallation} =
        await import('../../util/packageManager/installationInfo/index.js')
      vi.mocked(detectCliInstallation).mockResolvedValue({
        currentExecution: {
          binaryPath: '/test/project/node_modules/.bin/sanity',
          packageManager: 'pnpm',
          resolvedFrom: 'local',
        },
        globalInstallations: [],
        issues: [],
        packages: {},
        workspace: {
          bunfig: false,
          hasMultipleLockfiles: false,
          lockfile: null,
          nearestPackageJson: null,
          root: '/test/project',
          type: 'standalone',
          yarnBerry: false,
        },
      })

      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {...defaultMocks, token: undefined},
      })

      if (error) throw error
      expect(stdout).toContain('locally')
    })

    test('shows "via npx" when running via npx', async () => {
      const {detectCliInstallation} =
        await import('../../util/packageManager/installationInfo/index.js')
      vi.mocked(detectCliInstallation).mockResolvedValue({
        currentExecution: {
          binaryPath: '/tmp/_npx/sanity',
          packageManager: 'npm',
          resolvedFrom: 'npx',
        },
        globalInstallations: [],
        issues: [],
        packages: {},
        workspace: {
          bunfig: false,
          hasMultipleLockfiles: false,
          lockfile: null,
          nearestPackageJson: null,
          root: '/test/project',
          type: 'standalone',
          yarnBerry: false,
        },
      })

      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {...defaultMocks, token: undefined},
      })

      if (error) throw error
      expect(stdout).toContain('via npx')
    })

    test('shows "unknown" when install context cannot be determined', async () => {
      const {detectCliInstallation} =
        await import('../../util/packageManager/installationInfo/index.js')
      vi.mocked(detectCliInstallation).mockResolvedValue({
        currentExecution: {
          binaryPath: null,
          packageManager: null,
          resolvedFrom: 'unknown',
        },
        globalInstallations: [],
        issues: [],
        packages: {},
        workspace: {
          bunfig: false,
          hasMultipleLockfiles: false,
          lockfile: null,
          nearestPackageJson: null,
          root: '/test/project',
          type: 'standalone',
          yarnBerry: false,
        },
      })

      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {...defaultMocks, token: undefined},
      })

      if (error) throw error
      expect(stdout).toContain('unknown')
    })

    test('shows "globally" without package manager when pm is null', async () => {
      const {detectCliInstallation} =
        await import('../../util/packageManager/installationInfo/index.js')
      vi.mocked(detectCliInstallation).mockResolvedValue({
        currentExecution: {
          binaryPath: '/usr/local/bin/sanity',
          packageManager: null,
          resolvedFrom: 'global',
        },
        globalInstallations: [],
        issues: [],
        packages: {},
        workspace: {
          bunfig: false,
          hasMultipleLockfiles: false,
          lockfile: null,
          nearestPackageJson: null,
          root: '/test/project',
          type: 'standalone',
          yarnBerry: false,
        },
      })

      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {...defaultMocks, token: undefined},
      })

      if (error) throw error
      expect(stdout).toContain('globally')
      expect(stdout).not.toContain('globally (')
    })

    test('handles CLI version detection failure gracefully', async () => {
      const {getCliVersion} = await import('../../util/getCliVersion.js')
      vi.mocked(getCliVersion).mockRejectedValue(new Error('Cannot find package.json'))

      vi.mocked(getCliToken).mockResolvedValue(undefined)
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {...defaultMocks, token: undefined},
      })

      if (error) throw error
      expect(stdout).toContain('CLI:')
      expect(stdout).toContain('Unable to determine CLI version')
    })
  })

  describe('full output integration', () => {
    test('shows all sections when logged in with project context', async () => {
      const {access: mockAccess} = await import('node:fs/promises')
      vi.mocked(mockAccess).mockImplementation(async (filePath) => {
        if (typeof filePath === 'string' && filePath.endsWith('sanity.cli.ts')) {
          return undefined
        }
        throw new Error('ENOENT')
      })

      vi.mocked(getCliToken).mockResolvedValue('mock-auth-token')
      vi.mocked(tryFindStudioConfigPath).mockResolvedValue('/test/project/sanity.config.ts')
      vi.mocked(getStudioConfig)
        .mockResolvedValueOnce({
          basePath: '/',
          dataset: 'production',
          name: 'default',
          projectId: 'abc123',
          title: 'My Studio',
          unstable_sources: [
            {dataset: 'production', projectId: 'abc123', schema: {_original: {types: []}}},
          ],
        } as never)
        .mockRejectedValueOnce(new Error('Not resolvable'))

      mockApi({
        apiVersion: USERS_API_VERSION,
        projectId: 'project123',
        uri: '/users/me',
      })
        .reply(200, {
          email: 'test@example.com',
          id: 'user123',
          name: 'Test User',
          provider: 'google',
        })
        .persist()

      const {error, stdout} = await testCommand(Debug, [], {mocks: defaultMocks})

      if (error) throw error
      // All section headers present
      expect(stdout).toContain('User:')
      expect(stdout).toContain('Authentication:')
      expect(stdout).toContain('CLI:')
      expect(stdout).toContain('Project:')
      expect(stdout).toContain('Studio:')
    })

    test('shows minimal output when outside project and not logged in', async () => {
      vi.mocked(getCliToken).mockResolvedValue(undefined)

      const {error, stdout} = await testCommand(Debug, [], {
        mocks: {
          cliConfigError: new ProjectRootNotFoundError('No project root found'),
          token: undefined,
        },
      })

      if (error) throw error
      expect(stdout).toContain('User:')
      expect(stdout).toContain('Not logged in')
      expect(stdout).not.toContain('Authentication:')
      expect(stdout).toContain('CLI:')
      expect(stdout).toContain('Project:')
      expect(stdout).toContain('No project found')
      expect(stdout).not.toContain('Studio:')
    })
  })
})

import {ProjectRootNotFoundError} from '@sanity/cli-core/errors'
import {mocks} from '@sanity/cli-test/mocks/cli-core/SanityCommand'
import {convertToSystemPath} from '@sanity/cli-test/paths'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {Debug} from '../debug.js'

const mockGatherAuthInfo = vi.hoisted(() => vi.fn())
const mockGatherCliInfo = vi.hoisted(() => vi.fn())
const mockGatherProjectInfo = vi.hoisted(() => vi.fn())
const mockGatherResolvedWorkspaces = vi.hoisted(() => vi.fn())
const mockGatherStudioWorkspaces = vi.hoisted(() => vi.fn())
const mockGatherUserInfo = vi.hoisted(() => vi.fn())

vi.mock(
  '@sanity/cli-core/SanityCommand',
  () => import('@sanity/cli-test/mocks/cli-core/SanityCommand'),
)
vi.mock('../../actions/debug/gatherDebugInfo.js', () => ({
  gatherAuthInfo: mockGatherAuthInfo,
  gatherCliInfo: mockGatherCliInfo,
  gatherProjectInfo: mockGatherProjectInfo,
  gatherResolvedWorkspaces: mockGatherResolvedWorkspaces,
  gatherStudioWorkspaces: mockGatherStudioWorkspaces,
  gatherUserInfo: mockGatherUserInfo,
}))

const defaultCliConfig = {
  api: {
    projectId: 'project123',
  },
}
const defaultGatheredProjectInfo = {
  cliConfigPath: '/some/config/path',
  rootPath: '/some/root/path',
}
const defaultGatheredAuthInfo = {hasToken: true, token: 'sometoken', userType: 'normal'}
const defaultGatheredUserInfo = {
  email: 'test@example.com',
  id: 'user123',
  name: 'Test User',
  provider: 'google',
}

describe('#debug', () => {
  beforeEach(() => {
    mocks.SanityCmdGetCliConfig.mockResolvedValue(defaultCliConfig)
    mockGatherProjectInfo.mockImplementation((projectDir) => ({
      ...defaultGatheredProjectInfo,
      rootPath: projectDir,
    }))
    mockGatherAuthInfo.mockResolvedValue(defaultGatheredAuthInfo)
    mockGatherCliInfo.mockResolvedValue({})
    mockGatherResolvedWorkspaces.mockResolvedValue([])
    mockGatherUserInfo.mockResolvedValue(defaultGatheredUserInfo)
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe.only('User section', () => {
    test('shows user info when logged in with project context', async () => {
      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('User:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Test User'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('test@example.com'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('user123'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('google'))
    })

    test('shows gatherUserInfo error details', async () => {
      mockGatherUserInfo.mockResolvedValue(new Error('uh oh'))

      await Debug.run([])

      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('User:'))
      // Should show error message but not crash
      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('uh oh'))
    })
  })

  describe.only('Authentication section', () => {
    test('passes includeSecrets=false to gatherAuthInfo by default', async () => {
      await Debug.run([])

      expect(mocks.SanityCmdOutput.error).not.toHaveBeenCalled()
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Authentication:'),
      )
      expect(mockGatherAuthInfo).toHaveBeenCalledWith(false)
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('(run with --secrets to reveal token)'),
      )
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('secret-token-12345'),
      )
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('CLI:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('6.1.4'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('globally (npm)'),
      )
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Project:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('No project found'),
      )
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Project:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining(convertToSystemPath('/test/project')),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('sanity.cli.ts'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('sanity.config.ts'),
      )
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Project:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('sanity.cli.ts'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('has errors'))
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Project:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('not found'))
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Studio:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Workspaces:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('default'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('abc123'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('production'))
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Studio:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('staging'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('production'))
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('sanity.config.ts'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('has errors'))
      // Studio section should appear with the error message
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Studio:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Config parse error'),
      )
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Resolved configuration:'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('default (My Studio)'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('administrator'),
      )
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Workspaces:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('unable to resolve full studio configuration'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Plugin resolution failed'),
      )
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('locally'))
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('via npx'))
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('unknown'))
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('globally'))
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('CLI:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Unable to determine CLI version'),
      )
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('User:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Authentication:'),
      )
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('CLI:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Project:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Studio:'))
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
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('User:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('Not logged in'),
      )
      expect(stdout).not.toContain('Authentication:')
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('CLI:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(expect.stringContaining('Project:'))
      expect(mocks.SanityCmdOutput.log).toHaveBeenCalledWith(
        expect.stringContaining('No project found'),
      )
      expect(stdout).not.toContain('Studio:')
    })
  })
})

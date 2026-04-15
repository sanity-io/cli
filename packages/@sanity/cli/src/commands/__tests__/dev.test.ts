import {readFile, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {platform} from 'node:os'
import {join} from 'node:path'

import {confirm} from '@sanity/cli-core/ux'
import {testCommand, testFixture} from '@sanity/cli-test'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {closeServer, tryCloseServer} from '../../../test/testUtils.js'
import {checkRequiredDependencies} from '../../actions/build/checkRequiredDependencies.js'
import {compareDependencyVersions} from '../../util/compareDependencyVersions.js'
import {getPackageManagerChoice} from '../../util/packageManager/packageManagerChoice.js'
import {upgradePackages} from '../../util/packageManager/upgradePackages.js'
import {DevCommand} from '../dev.js'

vi.mock('../../actions/build/checkRequiredDependencies.js', () => ({
  checkRequiredDependencies: vi.fn().mockResolvedValue({
    installedSanityVersion: '3.0.0',
  }),
}))

vi.mock('../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: vi.fn().mockResolvedValue({mismatched: [], unresolvedPrerelease: []}),
}))

vi.mock('@sanity/cli-core/ux', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core/ux')>('@sanity/cli-core/ux')
  return {
    ...actual,
    confirm: vi.fn(),
  }
})

vi.mock('../../util/packageManager/upgradePackages.js')
vi.mock('../../util/packageManager/packageManagerChoice.js')

// Prevent the workbench dev server from starting — it would shift ports (+1)
// and suppress output messages that tests assert on.
vi.mock('../../actions/dev/startWorkbenchDevServer.js', () => ({
  startWorkbenchDevServer: vi.fn().mockImplementation(async (options) => {
    const {getSharedServerConfig} = await vi.importActual<
      typeof import('../../util/getSharedServerConfig.js')
    >('../../util/getSharedServerConfig.js')

    const {httpHost, httpPort} = getSharedServerConfig({
      cliConfig: options.cliConfig,
      flags: {host: options.flags.host, port: options.flags.port},
      workDir: options.workDir,
    })

    return {close: async () => {}, httpHost, workbenchAvailable: false, workbenchPort: httpPort}
  }),
}))

vi.mock('@sanity/cli-core', async () => {
  const actual = await vi.importActual<typeof import('@sanity/cli-core')>('@sanity/cli-core')
  return {
    ...actual,
    isInteractive: vi.fn(() => true),
  }
})

const mockCheckRequiredDependencies = vi.mocked(checkRequiredDependencies)
const mockCompareDependencyVersions = vi.mocked(compareDependencyVersions)
const mockConfirm = vi.mocked(confirm)
const mockUpgradePackages = vi.mocked(upgradePackages)
const mockGetPackageManagerChoice = vi.mocked(getPackageManagerChoice)

describe('#dev', {timeout: (platform() === 'win32' ? 60 : 30) * 1000}, () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  test('shows an error for invalid flags', async () => {
    const {error} = await testCommand(DevCommand, ['--invalid'], {
      mocks: {isInteractive: true},
    })

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })

  describe('basic-app', () => {
    test('should start the dev server for app', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const {error, result, stderr, stdout} = await testCommand(DevCommand, ['--port', '5333'], {
        config: {root: cwd},
        mocks: {isInteractive: true},
      })

      if (error) throw error
      expect(stdout).toContain('App dev server started on port 5333')
      expect(stderr).toContain('Checking configuration files')
      await tryCloseServer(result)
    })

    test('should start on next available port when requested port is in use', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      // Apps use strictPort: false, so Vite auto-selects the next available port
      const server = createServer()
      await new Promise<void>((resolve) => {
        server.listen(5338, 'localhost', resolve)
      })

      try {
        const {error, result, stdout} = await testCommand(DevCommand, ['--port', '5338'], {
          config: {root: cwd},
          mocks: {isInteractive: true},
        })

        if (error) throw error
        expect(stdout).toMatch(/App dev server started on port \d{4}/)
        expect(stdout).not.toContain('App dev server started on port 5338')
        await tryCloseServer(result)
      } finally {
        await closeServer(server)
      }
    })

    test('should error when organizationId is missing from config', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      // Modify the config to remove organizationId
      const configPath = join(cwd, 'sanity.cli.ts')
      const existingConfig = await readFile(configPath, 'utf8')
      const modifiedConfig = existingConfig.replace(/organizationId: '[^']*',?/, '')
      await writeFile(configPath, modifiedConfig)

      const {error} = await testCommand(DevCommand, ['--port', '5341'], {
        config: {root: cwd},
        mocks: {isInteractive: true},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('Apps require an organization ID (orgId)')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should fallback to env variables when host and port flags not set', async () => {
      vi.stubEnv('SANITY_APP_SERVER_HOSTNAME', '127.0.0.1')
      vi.stubEnv('SANITY_APP_SERVER_PORT', '5350')

      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const {error, result, stdout} = await testCommand(DevCommand, [], {
        config: {root: cwd},
        mocks: {isInteractive: true},
      })

      if (error) throw error
      expect(stdout).toContain('App dev server started on port 5350')
      await tryCloseServer(result)
    })

    test('should fallback to config variables when host and port flags not set', async () => {
      const cwd = await testFixture('basic-app')
      process.cwd = () => cwd

      const {error, result, stdout} = await testCommand(DevCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            server: {
              hostname: '127.0.0.1',
              port: 5351,
            },
          },
          isInteractive: true,
        },
      })

      if (error) throw error
      expect(stdout).toContain('http://127.0.0.1:5351')
      await tryCloseServer(result)
    })
  })

  describe('basic-studio', () => {
    test('should start the dev server for studio', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const {error, result, stderr, stdout} = await testCommand(DevCommand, ['--port', '5335'], {
        config: {root: cwd},
        mocks: {isInteractive: true},
      })

      if (error) throw error
      expect(stdout).toContain('Sanity Studio using vite@')
      expect(stdout).not.toContain('vite@null')
      expect(stdout).toMatch(/vite@\d+\.\d+/)
      expect(stdout).toContain('ready in')
      expect(stdout).toContain('ms and running at http://localhost:5335')
      expect(stderr).toContain('Checking configuration files')

      await tryCloseServer(result)
    })

    test('should start with custom host configuration', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const {error, result, stdout} = await testCommand(
        DevCommand,
        ['--host', '127.0.0.1', '--port', '5359'],
        {
          config: {root: cwd},
          mocks: {isInteractive: true},
        },
      )

      if (error) throw error
      expect(stdout).toContain('http://127.0.0.1:5359')
      await tryCloseServer(result)
    })

    test('should start dev server successfully when user declines auto-updates', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      mockCompareDependencyVersions.mockResolvedValueOnce({
        mismatched: [
          {
            installed: '3.0.0',
            pkg: 'sanity',
            remote: '3.1.0',
          },
        ],
        unresolvedPrerelease: [],
      })
      mockConfirm.mockResolvedValueOnce(false) // User declines upgrade

      const {error, result, stderr, stdout} = await testCommand(
        DevCommand,
        ['--auto-updates', '--port', '5346'],
        {
          config: {root: cwd},
        },
      )

      if (error) throw error
      // Check that the server started successfully with auto-updates flag
      expect(stdout).toMatch(/running at http:\/\/localhost:5346/)
      expect(stderr).toContain('Checking configuration files')
      await tryCloseServer(result)
    })

    test('should handle auto-updates with version mismatch and user accepts upgrade', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      mockCompareDependencyVersions.mockResolvedValueOnce({
        mismatched: [
          {
            installed: '3.0.0',
            pkg: 'sanity',
            remote: '3.1.0',
          },
        ],
        unresolvedPrerelease: [],
      })
      mockConfirm.mockResolvedValueOnce(true) // User accepts upgrade

      mockUpgradePackages.mockResolvedValueOnce(undefined)
      mockGetPackageManagerChoice.mockResolvedValueOnce({
        chosen: 'npm',
        mostOptimal: 'npm',
      })

      const {error, result, stderr, stdout} = await testCommand(
        DevCommand,
        ['--auto-updates', '--port', '5348'],
        {
          config: {root: cwd},
          mocks: {isInteractive: true},
        },
      )

      if (error) throw error
      expect(stdout).toMatch(/running at http:\/\/localhost:5348/)
      expect(stderr).toContain('Checking configuration files')

      expect(mockUpgradePackages).toHaveBeenCalledWith(
        {
          packageManager: 'npm',
          packages: [['sanity', '3.1.0']],
        },
        {output: expect.any(Object), workDir: cwd},
      )

      await tryCloseServer(result)
    })

    test('should warn about prerelease versions during auto-updates', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      mockCompareDependencyVersions.mockResolvedValueOnce({
        mismatched: [],
        unresolvedPrerelease: [
          {pkg: 'sanity', version: '3.0.0-alpha.1'},
          {pkg: '@sanity/vision', version: '3.0.0-alpha.1'},
        ],
      })

      const {error, result, stderr} = await testCommand(
        DevCommand,
        ['--auto-updates', '--port', '5349'],
        {
          config: {root: cwd},
          mocks: {isInteractive: true},
        },
      )

      if (error) throw error
      expect(stderr).toContain('sanity (3.0.0-alpha.1)')
      expect(stderr).toContain('@sanity/vision (3.0.0-alpha.1)')
      expect(stderr).toContain('locally installed version')
      await tryCloseServer(result)
    })

    test('should handle invalid Sanity version during auto-updates', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      mockCheckRequiredDependencies.mockResolvedValueOnce({
        installedSanityVersion: 'invalid-version',
      })

      const {error} = await testCommand(DevCommand, ['--auto-updates', '--port', '5347'], {
        config: {root: cwd},
        mocks: {isInteractive: true},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('Failed to parse installed Sanity version')
    })

    test('should fallback to env variables when host and port flags not set', async () => {
      vi.stubEnv('SANITY_STUDIO_SERVER_HOSTNAME', '127.0.0.1')
      vi.stubEnv('SANITY_STUDIO_SERVER_PORT', '5355')

      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const {error, result, stdout} = await testCommand(DevCommand, [], {
        config: {root: cwd},
        mocks: {isInteractive: true},
      })

      if (error) throw error
      expect(stdout).toContain('http://127.0.0.1:5355')
      await tryCloseServer(result)
    })

    test('should fallback to config variables when host and port flags not set', async () => {
      const cwd = await testFixture('basic-studio')
      process.cwd = () => cwd

      const {error, result, stdout} = await testCommand(DevCommand, [], {
        config: {root: cwd},
        mocks: {
          cliConfig: {
            server: {
              hostname: '127.0.0.1',
              port: 5357,
            },
          },
          isInteractive: true,
        },
      })

      if (error) throw error
      expect(stdout).toContain('http://127.0.0.1:5357')
      await tryCloseServer(result)
    })
  })

  test('should start on next available port when requested port is in use', async () => {
    const cwd = await testFixture('basic-studio')
    process.cwd = () => cwd

    // Studios use strictPort: false, so Vite auto-selects the next available port
    const server1 = createServer()
    await new Promise<void>((resolve) => server1.listen(5337, 'localhost', resolve))

    try {
      const {error, result, stdout} = await testCommand(DevCommand, ['--port', '5337'], {
        config: {root: cwd},
        mocks: {isInteractive: true},
      })

      if (error) throw error
      expect(stdout).toMatch(/running at http:\/\/localhost:\d{4}/)
      expect(stdout).not.toContain('running at http://localhost:5337')
      await tryCloseServer(result)
    } finally {
      await closeServer(server1)
    }
  })
})

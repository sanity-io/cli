import {readFile, writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import {join} from 'node:path'

import {confirm} from '@sanity/cli-core/ux'
import {runCommand} from '@oclif/test'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {afterEach, describe, expect, test, vi} from 'vitest'
import {testExample} from '~test/helpers/testExample.js'

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
  compareDependencyVersions: vi.fn().mockResolvedValue([]),
}))

vi.mock('@sanity/cli-core/ux')

vi.mock('../../../../cli-core/src/util/isInteractive.js', () => ({
  isInteractive: vi.fn().mockReturnValue(true),
}))

vi.mock('../../util/packageManager/upgradePackages.js')
vi.mock('../../util/packageManager/packageManagerChoice.js')

const mockCheckRequiredDependencies = vi.mocked(checkRequiredDependencies)
const mockCompareDependencyVersions = vi.mocked(compareDependencyVersions)
const mockConfirm = vi.mocked(confirm)
const mockUpgradePackages = vi.mocked(upgradePackages)
const mockGetPackageManagerChoice = vi.mocked(getPackageManagerChoice)

type Result = {
  close?: () => Promise<void>
}

describe('#dev', () => {
  afterEach(() => {
    const pending = nock.pendingMocks()
    nock.cleanAll()
    expect(pending, 'pending mocks').toEqual([])

    vi.clearAllMocks()
  })

  test('help text is correct', async () => {
    const {stdout} = await runCommand(['dev', '--help'])
    expect(stdout).toMatchInlineSnapshot(`
      "Starts a local development server for Sanity Studio with live reloading

      USAGE
        $ sanity dev [--auto-updates] [--host <value>]
          [--load-in-dashboard] [--port <value>]

      FLAGS
        --[no-]auto-updates       Automatically update Sanity Studio dependencies.
        --host=<value>            [default: localhost] The local network interface at
                                  which to listen.
        --[no-]load-in-dashboard  Load the app/studio in the Sanity dashboard.
        --port=<value>            [default: 3333] TCP port to start server on.

      DESCRIPTION
        Starts a local development server for Sanity Studio with live reloading

      EXAMPLES
        $ sanity dev --host=0.0.0.0

        $ sanity dev --port=1942

        $ sanity dev --load-in-dashboard

      "
    `)
  })

  test('shows an error for invalid flags', async () => {
    const {error} = await testCommand(DevCommand, ['--invalid'])

    expect(error?.message).toContain('Nonexistent flag: --invalid')
  })

  describe('basic-app', () => {
    test('should start the dev server for app', async () => {
      const cwd = await testExample('basic-app')
      process.cwd = () => cwd

      const {error, result, stderr, stdout} = await testCommand(DevCommand, ['--port', '5333'], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('Dev server started on port 5333')
      expect(stdout).toContain('View your app in the Sanity dashboard here:')
      expect(stderr).toContain('Checking configuration files')
      await (result as Result).close?.()
    })

    test('should warn when --no-load-in-dashboard is used with app', async () => {
      const cwd = await testExample('basic-app')
      process.cwd = () => cwd

      const {error, result, stderr, stdout} = await testCommand(
        DevCommand,
        ['--no-load-in-dashboard', '--port', '5334'],
        {
          config: {root: cwd},
        },
      )

      expect(error).toBeUndefined()
      expect(stderr).toContain('Apps cannot run without the Sanity dashboard')
      expect(stderr).toContain('Starting dev server with the --load-in-dashboard flag set to true')
      expect(stdout).toContain('Dev server started on port 5334')
      await (result as Result).close?.()
    })

    test('should automatically change port if conflicted', async () => {
      const cwd = await testExample('basic-app')
      process.cwd = () => cwd

      // Create a server on port 5338 to block it
      const server = createServer()
      await new Promise<void>((resolve) => {
        server.listen(5338, 'localhost', resolve)
      })

      try {
        const {error, result, stdout} = await testCommand(DevCommand, ['--port', '5338'], {
          config: {root: cwd},
        })

        expect(error).toBeUndefined()
        // Should automatically pick a different port
        expect(stdout).toMatch(/Dev server started on port \d{4}/)
        expect(stdout).not.toContain('Dev server started on port 5338')
        expect(stdout).toContain('View your app in the Sanity dashboard here:')
        await (result as Result).close?.()
      } finally {
        // Clean up the server
        await new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err) reject(err)
            else resolve()
          })
        })
      }
    })

    test('should error when organizationId is missing from config', async () => {
      const cwd = await testExample('basic-app')
      process.cwd = () => cwd

      // Modify the config to remove organizationId
      const configPath = join(cwd, 'sanity.cli.ts')
      const existingConfig = await readFile(configPath, 'utf8')
      const modifiedConfig = existingConfig.replace(/organizationId: '[^']*',?/, '')
      await writeFile(configPath, modifiedConfig)

      const {error} = await testCommand(DevCommand, ['--port', '5341'], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('Apps require an organization ID (orgId)')
      expect(error?.oclif?.exit).toBe(1)
    })
  })

  describe('basic-studio', () => {
    test('should start the dev server for studio', async () => {
      const cwd = await testExample('basic-studio')
      process.cwd = () => cwd

      const {error, result, stderr, stdout} = await testCommand(DevCommand, ['--port', '5335'], {
        config: {root: cwd},
      })

      expect(error).toBeUndefined()
      expect(stdout).toContain('Sanity Studio using vite@')
      expect(stdout).toContain('ready in')
      expect(stdout).toContain('ms and running at http://localhost:5335')
      expect(stderr).toContain('Checking configuration files')
      await (result as Result).close?.()
    })

    test('should start with custom host configuration', async () => {
      const cwd = await testExample('basic-studio')
      process.cwd = () => cwd

      const {error, result, stdout} = await testCommand(
        DevCommand,
        ['--host', '127.0.0.1', '--port', '5336'],
        {
          config: {root: cwd},
        },
      )

      expect(error).toBeUndefined()
      expect(stdout).toContain('http://127.0.0.1:5336')
      await (result as Result).close?.()
    })

    test('should start with load-in-dashboard', async () => {
      const cwd = await testExample('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project'

      // Need to modify the sanity config to include projectId for this test
      const configPath = join(cwd, 'sanity.cli.ts')
      const existingConfig = await readFile(configPath, 'utf8')

      // Add projectId to the config
      const modifiedConfig = existingConfig.replace(
        /projectId: '.*',/,
        `projectId: '${projectId}',`,
      )

      await writeFile(configPath, modifiedConfig)

      mockApi({
        apiVersion: 'v2025-08-25',
        uri: `/projects/${projectId}`,
      }).reply(200, {organizationId: 'test-org'})

      const {error, result, stderr, stdout} = await testCommand(
        DevCommand,
        ['--load-in-dashboard', '--port', '5340'],
        {
          config: {root: cwd},
        },
      )

      expect(error).toBeUndefined()
      expect(stdout).toContain('Dev server started on port 5340')
      expect(stdout).toContain('View your studio in the Sanity dashboard here:')
      expect(stdout).toContain('https://www.sanity.io/@test-org?dev=http%3A%2F%2Flocalhost%3A5340')
      expect(stderr).toContain('Checking configuration files')

      await (result as Result).close?.()
    })

    test('should error when projectId is missing with --load-in-dashboard', async () => {
      const cwd = await testExample('basic-studio')
      process.cwd = () => cwd

      // Modify config to remove projectId
      const configPath = join(cwd, 'sanity.cli.ts')
      const existingConfig = await readFile(configPath, 'utf8')
      const modifiedConfig = existingConfig.replace(/projectId: '[^']*',/, '')
      await writeFile(configPath, modifiedConfig)

      const {error} = await testCommand(DevCommand, ['--load-in-dashboard', '--port', '5343'], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('Project Id is required to load in dashboard')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should error when API fails to fetch organizationId', async () => {
      const cwd = await testExample('basic-studio')
      process.cwd = () => cwd

      const projectId = 'test-project'
      const configPath = join(cwd, 'sanity.cli.ts')
      const existingConfig = await readFile(configPath, 'utf8')
      const modifiedConfig = existingConfig.replace(
        /projectId: '.*',/,
        `projectId: '${projectId}',`,
      )
      await writeFile(configPath, modifiedConfig)

      mockApi({
        apiVersion: 'v2025-08-25',
        uri: `/projects/${projectId}`,
      }).reply(404, {error: 'Project not found'})

      const {error} = await testCommand(DevCommand, ['--load-in-dashboard', '--port', '5344'], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('Failed to get organization id from project id')
      expect(error?.oclif?.exit).toBe(1)
    })

    test('should start dev server successfully when user declines auto-updates', async () => {
      const cwd = await testExample('basic-studio')
      process.cwd = () => cwd

      mockCompareDependencyVersions.mockResolvedValueOnce([
        {
          installed: '3.0.0',
          pkg: 'sanity',
          remote: '3.1.0',
        },
      ])
      mockConfirm.mockResolvedValueOnce(false) // User declines upgrade

      const {error, result, stderr, stdout} = await testCommand(
        DevCommand,
        ['--auto-updates', '--port', '5346'],
        {
          config: {root: cwd},
        },
      )

      expect(error).toBeUndefined()
      // Check that the server started successfully with auto-updates flag
      expect(stdout).toMatch(/running at http:\/\/localhost:5346/)
      expect(stderr).toContain('Checking configuration files')
      await (result as Result).close?.()
    })

    test('should handle auto-updates with version mismatch and user accepts upgrade', async () => {
      const cwd = await testExample('basic-studio')
      process.cwd = () => cwd

      mockCompareDependencyVersions.mockResolvedValueOnce([
        {
          installed: '3.0.0',
          pkg: 'sanity',
          remote: '3.1.0',
        },
      ])
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
        },
      )

      expect(error).toBeUndefined()
      expect(stdout).toMatch(/running at http:\/\/localhost:5348/)
      expect(stderr).toContain('Checking configuration files')

      expect(mockUpgradePackages).toHaveBeenCalledWith(
        {
          packageManager: 'npm',
          packages: [['sanity', '3.1.0']],
        },
        {output: expect.any(Object), workDir: cwd},
      )

      await (result as Result).close?.()
    })

    test('should handle invalid Sanity version during auto-updates', async () => {
      const cwd = await testExample('basic-studio')
      process.cwd = () => cwd

      mockCheckRequiredDependencies.mockResolvedValueOnce({
        installedSanityVersion: 'invalid-version',
      })

      const {error} = await testCommand(DevCommand, ['--auto-updates', '--port', '5347'], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('Failed to parse installed Sanity version')
    })
  })

  test('should throw an error if port is already in use', async () => {
    const cwd = await testExample('basic-studio')
    process.cwd = () => cwd

    // Create a server on port 5337 to block it
    const server = createServer()
    await new Promise<void>((resolve) => {
      server.listen(5337, 'localhost', resolve)
    })

    try {
      const {error} = await testCommand(DevCommand, ['--port', '5337'], {
        config: {root: cwd},
      })

      expect(error).toBeDefined()
      expect(error?.message).toContain('Port 5337 is already in use')
      expect(error?.oclif?.exit).toBe(1)
    } finally {
      // Clean up the server
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }
  })
})

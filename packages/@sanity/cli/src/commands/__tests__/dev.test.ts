import {createRequire} from 'node:module'

import {confirm} from '@inquirer/prompts'
import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {createServer} from 'vite'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

<<<<<<< HEAD
=======
import {getCliConfig} from '../../config/cli/getCliConfig.js'
import {compareDependencyVersions} from '../../util/compareDependencyVersions.js'
import {upgradePackages} from '../../util/packageManager/upgradePackages.js'
>>>>>>> 7510a541 (fix: add extensive testsing for dev command)
import {DevCommand} from '../dev.js'

const require = createRequire(import.meta.url)
const {version} = require('vite/package.json')

vi.mock(import('../../../../cli-core/src/config/findProjectRoot.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    findProjectRoot: vi.fn().mockResolvedValue({
      directory: '/test/path',
      root: '/test/path',
      type: 'studio',
    }),
  }
})

vi.mock(import('../../../../cli-core/src/config/cli/getCliConfig.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getCliConfig: vi.fn().mockResolvedValue({}),
  }
})

vi.mock(import('../../actions/build/writeSanityRuntime.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    writeSanityRuntime: vi.fn(),
  }
})

vi.mock(import('../../actions/build/checkRequiredDependencies.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    checkRequiredDependencies: vi.fn().mockResolvedValue({
      didInstall: false,
      installedSanityVersion: '1.0.0',
    }),
  }
})

vi.mock(import('../../actions/build/checkStudioDependencyVersions.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    checkStudioDependencyVersions: vi.fn(),
  }
})

vi.mock(import('../../util/compareDependencyVersions.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    compareDependencyVersions: vi.fn(),
  }
})

vi.mock(import('vite'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createServer: vi.fn(),
  }
})

vi.mock(import('@inquirer/prompts'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    confirm: vi.fn(),
  }
})

vi.mock(import('../../util/isInteractive.js'), () => ({
  isInteractive: true,
}))

vi.mock(import('../../util/packageManager/upgradePackages.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    upgradePackages: vi.fn(),
  }
})
vi.mock(import('../../util/packageManager/packageManagerChoice.js'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getPackageManagerChoice: vi.fn().mockResolvedValue({chosen: 'pnpm'}),
  }
})

const mockViteCreateServer = vi.mocked(createServer)
const mockGetCliConfig = vi.mocked(getCliConfig)
const mockCompareDependencyVersions = vi.mocked(compareDependencyVersions)
const mockConfirm = vi.mocked(confirm)
const mockUpgradePackages = vi.mocked(upgradePackages)

describe('#dev', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('help text is correct', async () => {
    const {stdout} = await runCommand('dev --help')
    expect(stdout).toMatchInlineSnapshot(`
      "Starts a local dev server for Sanity Studio with live reloading

      USAGE
        $ sanity dev [--auto-updates] [--host <value>]
          [--load-in-dashboard] [--port <value>]

      FLAGS
        --[no-]auto-updates       Automatically update Sanity Studio dependencies.
        --host=<value>            [default: localhost] The local network interface at
                                  which to listen.
        --[no-]load-in-dashboard  Load the dev server in the Sanity dashboard.
        --port=<value>            [default: 3333] TCP port to start server on.

      DESCRIPTION
        Starts a local dev server for Sanity Studio with live reloading

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

  describe('app', () => {
    test('should start the dev server', async () => {
      mockGetCliConfig.mockResolvedValue({
        app: {
          id: 'test',
          organizationId: 'test-org',
        },
      })

      mockViteCreateServer.mockResolvedValue({
        close: vi.fn(),
        config: {
          logger: {
            info: vi.fn(),
          },
        },
        listen: vi.fn(),
      } as never)

      const {error, stderr, stdout} = await testCommand(DevCommand, [], {})

      expect(stdout).toContain('Dev server started on port 3333')
      expect(stdout).toContain('View your app in the Sanity dashboard here:')
      expect(stdout).toContain('https://sanity.io/@test-org?dev=http%3A%2F%2Flocalhost%3A3333')
      expect(stderr).toContain('Checking configuration files...')
      expect(stderr).toContain(`Starting dev server`)

      expect(error).toBeUndefined()
    })

    test('should warn if no-load-in-dashboard is used', async () => {
      mockGetCliConfig.mockResolvedValue({
        app: {
          id: 'test',
          organizationId: 'test-org',
        },
      })

      mockViteCreateServer.mockResolvedValue({
        close: vi.fn(),
        config: {
          logger: {
            info: vi.fn(),
          },
        },
        listen: vi.fn(),
      } as never)

      const {error, stderr, stdout} = await testCommand(DevCommand, ['--no-load-in-dashboard'], {})

      expect(stdout).toContain('Dev server started on port 3333')
      expect(stdout).toContain('View your app in the Sanity dashboard here:')
      expect(stdout).toContain('https://sanity.io/@test-org?dev=http%3A%2F%2Flocalhost%3A3333')

      expect(stderr).toContain('Warning: Apps cannot run without the Sanity dashboard')
      expect(stderr).toContain('Starting dev server with the --load-in-dashboard flag set to true')

      expect(error).toBeUndefined()
    })

    test('throws an error if organizationId is not set', async () => {
      mockGetCliConfig.mockResolvedValue({
        app: {
          id: 'test',
        },
      })

      const {error} = await testCommand(DevCommand, [], {})

      expect(error?.message).toContain(
        'Failed to start dev server: Apps require an organization ID (orgId) specified in your sanity.cli.ts file',
      )
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles error from vite', async () => {
      mockGetCliConfig.mockResolvedValue({
        app: {
          id: 'test',
          organizationId: 'test-org',
        },
      })
      mockViteCreateServer.mockRejectedValue(new Error('Vite error'))

      const {error} = await testCommand(DevCommand, [], {})

      expect(error?.message).toContain('Vite error')
    })
  })

  describe('studio', () => {
    afterEach(() => {
      vi.clearAllMocks()
      const pending = nock.pendingMocks()
      nock.cleanAll()
      expect(pending, 'pending mocks').toEqual([])
    })

    beforeEach(() => {
      mockGetCliConfig.mockResolvedValue({})
    })

    test('should start the dev server', async () => {
      mockViteCreateServer.mockResolvedValue({
        close: vi.fn(),
        config: {
          logger: {
            info: console.log,
          },
        },
        listen: vi.fn(),
      } as never)

      const {error, stderr, stdout} = await testCommand(DevCommand, [], {})

      expect(stdout).toContain(`Sanity Studio using vite@${version} ready in`)
      expect(stdout).toContain('and running at http://localhost:3333')

      expect(stderr).toContain('Checking configuration files...')
      expect(stderr).toContain(`Starting dev server`)

      expect(error).toBeUndefined()
    })

    test('should start the dev server with load-in-dashboard', async () => {
      mockViteCreateServer.mockResolvedValue({
        close: vi.fn(),
        config: {
          logger: {
            info: vi.fn(),
          },
        },
        listen: vi.fn(),
      } as never)

      const projectId = 'test-project'

      mockApi({
        apiVersion: 'v2024-01-01',
        uri: `/projects/${projectId}`,
      }).reply(200, {organizationId: 'test-org'})

      mockGetCliConfig.mockResolvedValue({
        api: {
          projectId,
        },
      })

      const {error, stderr, stdout} = await testCommand(DevCommand, ['--load-in-dashboard'], {})

      expect(stdout).toContain('Dev server started on port 3333')
      expect(stdout).toContain('View your studio in the Sanity dashboard here:')
      expect(stdout).toContain('https://sanity.io/@test-org?dev=http%3A%2F%2Flocalhost%3A3333')
      expect(stderr).toContain('Checking configuration files...')
      expect(stderr).toContain(`Starting dev server`)

      expect(error).toBeUndefined()
    })

    test('throws an error if projectId is not set and load-in-dashboard is used', async () => {
      mockGetCliConfig.mockResolvedValue({})

      const {error} = await testCommand(DevCommand, ['--load-in-dashboard'], {})

      expect(error?.message).toContain(
        'Failed to start dev server: Project Id is required to load in dashboard',
      )
      expect(error?.oclif?.exit).toBe(1)
    })

    test('throws an error if organizationId is not found', async () => {
      mockGetCliConfig.mockResolvedValue({
        api: {
          projectId: 'test-project',
        },
      })

      mockApi({
        apiVersion: 'v2024-01-01',
        uri: `/projects/test-project`,
      }).reply(404, {error: 'Project not found'})

      const {error} = await testCommand(DevCommand, ['--load-in-dashboard'], {})

      expect(error?.message).toContain(
        'Failed to start dev server: Failed to get organization Id from project Id',
      )
      expect(error?.oclif?.exit).toBe(1)
    })

    test('handles error thrown from vite', async () => {
      mockGetCliConfig.mockResolvedValue({
        api: {
          projectId: 'test-project',
        },
      })

      mockViteCreateServer.mockRejectedValue(new Error('Vite error'))

      const {error} = await testCommand(DevCommand, [], {})

      expect(error?.message).toContain('Vite error')
    })

    test('shows a confirmation prompt if studio dependencies are out of date for auto-updates and is interactive', async () => {
      mockGetCliConfig.mockResolvedValue({
        api: {
          projectId: 'test-project',
        },
      })
      mockViteCreateServer.mockResolvedValue({
        close: vi.fn(),
        config: {
          logger: {
            info: vi.fn(),
          },
        },
        listen: vi.fn(),
      } as never)
      mockCompareDependencyVersions.mockResolvedValue([
        {
          installed: '3.98.0',
          pkg: 'sanity',
          remote: '3.99.0',
        },
        {
          installed: '3.98.0',
          pkg: '@sanity/vision',
          remote: '3.99.0',
        },
      ])

      await testCommand(DevCommand, ['--auto-updates'], {})

      expect(mockConfirm).toHaveBeenCalledWith({
        default: true,
        message: `The following local package versions are different from the versions currently served at runtime.
When using auto updates, we recommend that you run with the same versions locally as will be used when deploying.

 - sanity (local version: 3.98.0, runtime version: 3.99.0)
 - @sanity/vision (local version: 3.98.0, runtime version: 3.99.0)

Do you want to upgrade local versions?`,
      })
    })

    test('upgrades local versions if user confirms upgrade', async () => {
      mockGetCliConfig.mockResolvedValue({
        api: {
          projectId: 'test-project',
        },
      })
      mockViteCreateServer.mockResolvedValue({
        close: vi.fn(),
        config: {
          logger: {
            info: vi.fn(),
          },
        },
        listen: vi.fn(),
      } as never)
      mockCompareDependencyVersions.mockResolvedValue([
        {
          installed: '3.98.0',
          pkg: 'sanity',
          remote: '3.99.0',
        },
        {
          installed: '3.98.0',
          pkg: '@sanity/vision',
          remote: '3.99.0',
        },
      ])
      mockConfirm.mockResolvedValue(true)

      await testCommand(DevCommand, ['--auto-updates'], {})

      expect(mockUpgradePackages).toHaveBeenCalledWith(
        {
          packageManager: 'pnpm',
          packages: [
            ['sanity', '3.99.0'],
            ['@sanity/vision', '3.99.0'],
          ],
        },
        {
          output: {
            error: expect.any(Function),
            log: expect.any(Function),
            warn: expect.any(Function),
          },
          workDir: '/test/path',
        },
      )
    })
  })
})

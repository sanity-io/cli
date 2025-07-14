import {createRequire} from 'node:module'

import {runCommand} from '@oclif/test'
import {getCliConfig} from '@sanity/cli-core'
import {mockApi, testCommand} from '@sanity/cli-test'
import nock from 'nock'
import {createServer} from 'vite'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

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

vi.mock(import('vite'), async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createServer: vi.fn(),
  }
})

const mockViteCreateServer = vi.mocked(createServer)
const mockGetCliConfig = vi.mocked(getCliConfig)

describe('#dev', () => {
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
    beforeEach(() => {
      mockGetCliConfig.mockResolvedValue({
        app: {
          id: 'test',
          organizationId: 'test-org',
        },
      })
    })

    test('should start the dev server', async () => {
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
  })
})

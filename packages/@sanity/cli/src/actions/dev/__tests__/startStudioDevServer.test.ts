import {type CliConfig} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {startStudioDevServer} from '../startStudioDevServer.js'
import {createDevOptions, createMockOutput} from './testHelpers.js'

const mockStartDevServer = vi.hoisted(() => vi.fn())
const mockGracefulServerDeath = vi.hoisted(() => vi.fn())
const mockGetDevServerConfig = vi.hoisted(() => vi.fn())
const mockCheckStudioDependencyVersions = vi.hoisted(() => vi.fn())
const mockCheckRequiredDependencies = vi.hoisted(() => vi.fn())
const mockShouldAutoUpdate = vi.hoisted(() => vi.fn())
const mockCompareDependencyVersions = vi.hoisted(() => vi.fn())
const mockGetLocalPackageVersion = vi.hoisted(() => vi.fn())
const mockGetAppId = vi.hoisted(() => vi.fn())
const mockGetPackageManagerChoice = vi.hoisted(() => vi.fn())
const mockUpgradePackages = vi.hoisted(() => vi.fn())
const mockIsInteractive = vi.hoisted(() => vi.fn())
const mockConfirm = vi.hoisted(() => vi.fn())

vi.mock('../../../server/devServer.js', () => ({
  startDevServer: mockStartDevServer,
}))
vi.mock('../../../server/gracefulServerDeath.js', () => ({
  gracefulServerDeath: mockGracefulServerDeath,
}))
vi.mock('../getDevServerConfig.js', () => ({
  getDevServerConfig: mockGetDevServerConfig,
}))
vi.mock('../../build/checkStudioDependencyVersions.js', () => ({
  checkStudioDependencyVersions: mockCheckStudioDependencyVersions,
}))
vi.mock('../../build/checkRequiredDependencies.js', () => ({
  checkRequiredDependencies: mockCheckRequiredDependencies,
}))
vi.mock('../../build/shouldAutoUpdate.js', () => ({
  shouldAutoUpdate: mockShouldAutoUpdate,
}))
vi.mock('../../../util/compareDependencyVersions.js', () => ({
  compareDependencyVersions: mockCompareDependencyVersions,
}))
vi.mock('../../../util/getLocalPackageVersion.js', () => ({
  getLocalPackageVersion: mockGetLocalPackageVersion,
}))
vi.mock('../../../util/appId.js', () => ({
  getAppId: mockGetAppId,
}))
vi.mock('../../../util/packageManager/packageManagerChoice.js', () => ({
  getPackageManagerChoice: mockGetPackageManagerChoice,
}))
vi.mock('../../../util/packageManager/upgradePackages.js', () => ({
  upgradePackages: mockUpgradePackages,
}))
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    isInteractive: mockIsInteractive,
  }
})
vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...actual,
    confirm: mockConfirm,
    logSymbols: {error: '✗', info: 'ℹ', success: '✓', warning: '⚠'},
    spinner: vi.fn(() => ({
      fail: vi.fn(),
      start: vi.fn(() => ({fail: vi.fn(), succeed: vi.fn()})),
      succeed: vi.fn(),
    })),
  }
})

function mockServer({port = 3333}: {port?: number} = {}) {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    server: {
      config: {
        logger: {info: vi.fn()},
        server: {port},
      },
    },
  }
}

describe('startStudioDevServer', () => {
  beforeEach(() => {
    mockCheckStudioDependencyVersions.mockResolvedValue(undefined)
    mockCheckRequiredDependencies.mockResolvedValue({installedSanityVersion: '3.50.0'})
    mockShouldAutoUpdate.mockReturnValue(false)
    mockGetDevServerConfig.mockReturnValue({
      basePath: '/',
      cwd: '/tmp/sanity-project',
      httpHost: 'localhost',
      httpPort: 3333,
      reactStrictMode: false,
      staticPath: '/tmp/sanity-project/static',
    })
    mockStartDevServer.mockResolvedValue(mockServer())
    mockGetLocalPackageVersion.mockResolvedValue('5.0.0')
    mockGracefulServerDeath.mockImplementation((_cmd, _host, _port, err) => err)
    mockGetAppId.mockReturnValue('app-id')
    mockIsInteractive.mockReturnValue(false)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('starts the dev server and returns close/server', async () => {
    const result = await startStudioDevServer(createDevOptions())

    expect(mockCheckStudioDependencyVersions).toHaveBeenCalledWith(
      '/tmp/sanity-project',
      expect.anything(),
    )
    expect(mockCheckRequiredDependencies).toHaveBeenCalled()
    expect(mockStartDevServer).toHaveBeenCalled()
    expect(result.close).toBeDefined()
    expect(result.server).toBeDefined()
  })

  test('passes reactRefreshHost through to startDevServer', async () => {
    await startStudioDevServer(createDevOptions({reactRefreshHost: 'http://localhost:3333'}))

    expect(mockStartDevServer).toHaveBeenCalledWith(
      expect.objectContaining({reactRefreshHost: 'http://localhost:3333'}),
    )
  })

  test('logs schema-extraction info line when enabled in cliConfig', async () => {
    const output = createMockOutput()
    await startStudioDevServer(
      createDevOptions({
        cliConfig: {schemaExtraction: {enabled: true}} as CliConfig,
        output,
      }),
    )

    expect(output.log).toHaveBeenCalledWith(expect.stringContaining('schema extraction'))
  })

  test('wraps startup failures via gracefulServerDeath', async () => {
    const originalErr = Object.assign(new Error('boom'), {code: 'EADDRINUSE'})
    const wrappedErr = new Error('port in use')
    mockStartDevServer.mockRejectedValueOnce(originalErr)
    mockGracefulServerDeath.mockReturnValueOnce(wrappedErr)

    let error: unknown
    try {
      await startStudioDevServer(createDevOptions())
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(Error)
    expect(error).toBe(wrappedErr)
    expect(mockGracefulServerDeath).toHaveBeenCalledWith('dev', 'localhost', 3333, originalErr)
  })

  describe('auto-updates', () => {
    beforeEach(() => {
      mockShouldAutoUpdate.mockReturnValue(true)
    })

    test('throws when installed sanity version cannot be parsed', async () => {
      mockCheckRequiredDependencies.mockResolvedValueOnce({installedSanityVersion: 'not-a-version'})

      let error: unknown
      try {
        await startStudioDevServer(createDevOptions())
      } catch (err) {
        error = err
      }

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('Failed to parse installed Sanity version')
    })

    test('logs info line when auto-updates enabled and versions match', async () => {
      mockCompareDependencyVersions.mockResolvedValueOnce({
        mismatched: [],
        unresolvedPrerelease: [],
      })
      const output = createMockOutput()

      await startStudioDevServer(createDevOptions({output}))

      expect(output.log).toHaveBeenCalledWith(expect.stringContaining('auto-updates'))
      expect(mockCompareDependencyVersions).toHaveBeenCalled()
    })

    test('warns for each unresolved prerelease dependency', async () => {
      mockCompareDependencyVersions.mockResolvedValueOnce({
        mismatched: [],
        unresolvedPrerelease: [{pkg: 'sanity', version: '3.50.0-rc.1'}],
      })
      const output = createMockOutput()

      await startStudioDevServer(createDevOptions({output}))

      expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('prerelease'))
    })

    test('warns when compareDependencyVersions throws', async () => {
      mockCompareDependencyVersions.mockRejectedValueOnce(new Error('network down'))
      const output = createMockOutput()

      await startStudioDevServer(createDevOptions({output}))

      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to compare local versions'),
      )
    })

    test('logs mismatch message non-interactively without prompting', async () => {
      mockCompareDependencyVersions.mockResolvedValueOnce({
        mismatched: [{installed: '3.49.0', pkg: 'sanity', remote: '3.50.0'}],
        unresolvedPrerelease: [],
      })
      mockIsInteractive.mockReturnValue(false)
      const output = createMockOutput()

      await startStudioDevServer(createDevOptions({output}))

      expect(output.log).toHaveBeenCalledWith(
        expect.stringContaining('different from the versions'),
      )
      expect(mockConfirm).not.toHaveBeenCalled()
      expect(mockUpgradePackages).not.toHaveBeenCalled()
    })

    test('prompts and upgrades packages interactively when user confirms', async () => {
      mockCompareDependencyVersions.mockResolvedValueOnce({
        mismatched: [{installed: '3.49.0', pkg: 'sanity', remote: '3.50.0'}],
        unresolvedPrerelease: [],
      })
      mockIsInteractive.mockReturnValue(true)
      mockConfirm.mockResolvedValueOnce(true)
      mockGetPackageManagerChoice.mockResolvedValueOnce({chosen: 'pnpm'})

      await startStudioDevServer(createDevOptions())

      expect(mockConfirm).toHaveBeenCalled()
      expect(mockUpgradePackages).toHaveBeenCalledWith(
        expect.objectContaining({
          packageManager: 'pnpm',
          packages: [['sanity', '3.50.0']],
        }),
        expect.anything(),
      )
    })

    test('does not upgrade when user declines the prompt', async () => {
      mockCompareDependencyVersions.mockResolvedValueOnce({
        mismatched: [{installed: '3.49.0', pkg: 'sanity', remote: '3.50.0'}],
        unresolvedPrerelease: [],
      })
      mockIsInteractive.mockReturnValue(true)
      mockConfirm.mockResolvedValueOnce(false)

      await startStudioDevServer(createDevOptions())

      expect(mockConfirm).toHaveBeenCalled()
      expect(mockUpgradePackages).not.toHaveBeenCalled()
    })
  })
})

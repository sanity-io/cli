import {type CliConfig} from '@sanity/cli-core'
import {createMockOutput} from '@sanity/cli-test/test/util'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  createDevOptions,
  createMockDevServer,
  DEV_FLAGS,
  DEV_SERVER_CONFIG,
  studioWorkbenchApp,
} from '../../__tests__/testHelpers.js'
import {startStudioDevServer} from '../startStudioDevServer.js'

const mockStartDevServer = vi.hoisted(() => vi.fn())
const mockGracefulServerDeath = vi.hoisted(() => vi.fn())
const mockGetDevServerConfig = vi.hoisted(() => vi.fn())
const mockGetProjectCliClient = vi.hoisted(() => vi.fn())
const mockGetDashboardAppURL = vi.hoisted(() => vi.fn())
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

vi.mock('../../../../server/devServer.js', () => ({
  startDevServer: mockStartDevServer,
}))
vi.mock('../../../../server/gracefulServerDeath.js', () => ({
  gracefulServerDeath: mockGracefulServerDeath,
}))
vi.mock('../getDevServerConfig.js', () => ({
  getDevServerConfig: mockGetDevServerConfig,
}))
vi.mock('../getDashboardAppUrl.js', () => ({
  getDashboardAppURL: mockGetDashboardAppURL,
}))
vi.mock('@sanity/cli-build/_internal/build', () => ({
  checkRequiredDependencies: mockCheckRequiredDependencies,
  checkStudioDependencyVersions: mockCheckStudioDependencyVersions,
  compareDependencyVersions: mockCompareDependencyVersions,
}))
vi.mock('../../../build/shouldAutoUpdate.js', () => ({
  shouldAutoUpdate: mockShouldAutoUpdate,
}))
vi.mock('../../../../util/appId.js', () => ({
  getAppId: mockGetAppId,
}))
vi.mock('../../../../util/packageManager/packageManagerChoice.js', () => ({
  getPackageManagerChoice: mockGetPackageManagerChoice,
}))
vi.mock('../../../../util/packageManager/upgradePackages.js', () => ({
  upgradePackages: mockUpgradePackages,
}))
vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getLocalPackageVersion: mockGetLocalPackageVersion,
    getProjectCliClient: mockGetProjectCliClient,
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

describe('startStudioDevServer', () => {
  beforeEach(() => {
    mockCheckStudioDependencyVersions.mockResolvedValue(undefined)
    mockCheckRequiredDependencies.mockResolvedValue({installedSanityVersion: '3.50.0'})
    mockShouldAutoUpdate.mockReturnValue(false)
    mockGetDevServerConfig.mockReturnValue(DEV_SERVER_CONFIG)
    mockStartDevServer.mockResolvedValue(createMockDevServer())
    mockGetLocalPackageVersion.mockResolvedValue('5.0.0')
    mockGracefulServerDeath.mockImplementation((_cmd, _host, _port, err) => err)
    mockGetAppId.mockReturnValue('app-id')
    mockIsInteractive.mockReturnValue(false)
    mockGetDashboardAppURL.mockResolvedValue('https://sanity.io/@org-x?dev=http://localhost:3333')
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
    expect(result.started).toBe(true)
    if (!result.started) throw new Error('expected the server to start')
    expect(result.close).toBeDefined()
    expect(result.server).toBeDefined()
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

  describe('load-in-dashboard', () => {
    test('resolves the org and logs the dashboard URL for non-workbench studios', async () => {
      mockGetProjectCliClient.mockResolvedValue({
        projects: {
          getById: vi.fn().mockResolvedValue({organizationId: 'org-x'}),
        },
      })
      const output = createMockOutput()

      await startStudioDevServer(
        createDevOptions({
          cliConfig: {api: {projectId: 'proj-1'}} as CliConfig,
          flags: {...DEV_FLAGS, 'load-in-dashboard': true},
          output,
        }),
      )

      expect(mockGetDashboardAppURL).toHaveBeenCalledWith({
        httpHost: 'localhost',
        httpPort: 3333,
        organizationId: 'org-x',
      })
      expect(output.log).toHaveBeenCalledWith('Dev server started on port 3333')
      expect(output.log).toHaveBeenCalledWith('View your studio in the Sanity dashboard here:')
      expect(output.log).toHaveBeenCalledWith(
        expect.stringContaining('https://sanity.io/@org-x?dev=http://localhost:3333'),
      )
    })

    test('errors when projectId is missing', async () => {
      const output = createMockOutput()

      await startStudioDevServer(
        createDevOptions({flags: {...DEV_FLAGS, 'load-in-dashboard': true}, output}),
      )

      expect(output.error).toHaveBeenCalledWith('Project Id is required to load in dashboard', {
        exit: 1,
      })
    })

    test('ignores the flag for workbench studios', async () => {
      const output = createMockOutput()

      await startStudioDevServer(
        createDevOptions({
          cliConfig: {api: {projectId: 'proj-1'}, app: studioWorkbenchApp()} as CliConfig,
          flags: {...DEV_FLAGS, 'load-in-dashboard': true},
          output,
        }),
      )

      expect(mockGetProjectCliClient).not.toHaveBeenCalled()
      expect(mockGetDashboardAppURL).not.toHaveBeenCalled()
      const logCalls = (output.log as ReturnType<typeof vi.fn>).mock.calls.flat()
      expect(logCalls.some((c) => String(c).includes('dashboard'))).toBe(false)
    })
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

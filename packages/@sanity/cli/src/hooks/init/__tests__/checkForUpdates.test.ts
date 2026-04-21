import {getUserConfig, isCi} from '@sanity/cli-core'
import {testFixture, testHook} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getCommandAndConfig} from '../../../../test/helpers/getCommandAndConfig.js'
import {checkForUpdates} from '../checkForUpdates.js'

const mockDebug = vi.hoisted(() => Object.assign(vi.fn(), {enabled: false}))
const mockSpawn = vi.hoisted(() => vi.fn())
const mockIsInstalledGlobally = vi.hoisted(() => ({default: false}))
const mockIsInstalledUsingYarn = vi.hoisted(() => vi.fn())
const mockResolveUpdateTarget = vi.hoisted(() => vi.fn())
const mockResolveRunnerPackage = vi.hoisted(() => vi.fn())

const mockConfigStore = vi.hoisted(() => {
  const store = new Map<string, unknown>()
  return {
    clear: vi.fn(() => store.clear()),
    delete: vi.fn((key: string) => store.delete(key)),
    get: vi.fn((key: string) => store.get(key)),
    set: vi.fn((key: string, value: unknown) => store.set(key, value)),
  }
})

const mockGetUserConfig = vi.hoisted(() => vi.fn(() => mockConfigStore))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    spawn: mockSpawn,
  }
})

vi.mock('@sanity/cli-core', async () => ({
  ...(await vi.importActual('@sanity/cli-core')),
  getUserConfig: mockGetUserConfig,
  isCi: vi.fn(),
  subdebug: vi.fn(() => mockDebug),
}))

vi.mock('is-installed-globally', () => mockIsInstalledGlobally)

vi.mock('../../../util/update/isInstalledUsingYarn.js', () => ({
  isInstalledUsingYarn: mockIsInstalledUsingYarn,
}))

vi.mock('../../../util/update/resolveUpdateTarget.js', () => ({
  resolveUpdateTarget: mockResolveUpdateTarget,
}))

vi.mock('../../../util/update/resolveRunnerPackage.js', () => ({
  resolveRunnerPackage: mockResolveRunnerPackage,
}))

const mockIsCi = vi.mocked(isCi)
const originalIsTTY = process.stdout.isTTY
const originalArgv1 = process.argv[1]

function setCachedLatestVersion(options: {
  key?: string
  latestVersion: string
  updatedAt?: number
}): void {
  const {key = 'latestVersion:sanity', latestVersion, updatedAt = Date.now()} = options

  const userConfig = getUserConfig()
  userConfig.set(key, {
    updatedAt,
    value: latestVersion,
  })
}

describe('#checkForUpdates', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.unstubAllEnvs()
    mockIsCi.mockReturnValue(false)
    mockIsInstalledGlobally.default = false
    mockIsInstalledUsingYarn.mockReturnValue(false)
    mockSpawn.mockReturnValue({unref: vi.fn()})
    mockResolveUpdateTarget.mockResolvedValue({installedVersion: '3.60.0', packageName: 'sanity'})
    mockResolveRunnerPackage.mockResolvedValue({
      installedVersion: '6.3.2',
      packageName: '@sanity/cli',
    })
    process.stdout.isTTY = true
    process.argv[1] = originalArgv1

    mockConfigStore.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.stdout.isTTY = originalIsTTY
    process.argv[1] = originalArgv1
  })

  test('returns early if running on CI', async () => {
    const {config} = await getCommandAndConfig('help')
    mockIsCi.mockReturnValue(true)

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith(
      'Running on CI, or explicitly disabled, skipping update check',
    )
    expect(mockSpawn).not.toHaveBeenCalled()
    expect(mockResolveUpdateTarget).not.toHaveBeenCalled()
  })

  test('returns early if NO_UPDATE_NOTIFIER env variable is present', async () => {
    const {config} = await getCommandAndConfig('help')
    vi.stubEnv('NO_UPDATE_NOTIFIER', '1')

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith(
      'Running on CI, or explicitly disabled, skipping update check',
    )
    expect(mockSpawn).not.toHaveBeenCalled()
    expect(mockResolveUpdateTarget).not.toHaveBeenCalled()
  })

  test('returns early if not TTY', async () => {
    const {config} = await getCommandAndConfig('help')
    process.stdout.isTTY = false

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockSpawn).not.toHaveBeenCalled()
    expect(mockResolveUpdateTarget).not.toHaveBeenCalled()
  })

  test.each([
    ['npx', '/home/user/.npm/_npx/abc/node_modules/.bin/sanity', 'npx --yes @sanity/cli@latest'],
    [
      'pnpm dlx',
      '/home/user/.cache/pnpm/dlx/abc/node_modules/.bin/sanity',
      'pnpm dlx @sanity/cli@latest',
    ],
    [
      'yarn dlx',
      '/tmp/xfs-abc/dlx-123/node_modules/.bin/sanity',
      'yarn dlx -p @sanity/cli@latest sanity',
    ],
    ['bunx', '/tmp/bunx-1000-sanity@latest/node_modules/.bin/sanity', 'bunx @sanity/cli@latest'],
  ])(
    'shows runner-specific refresh hint when running from %s with an outdated cache',
    async (_runner, argv1, expectedCommand) => {
      const {config} = await getCommandAndConfig('help')
      process.argv[1] = argv1

      // Cache is keyed by @sanity/cli when running under a runner — cwd-based
      // resolution is bypassed.
      setCachedLatestVersion({
        key: 'latestVersion:@sanity/cli',
        latestVersion: '999.0.0',
      })

      const {stderr} = await testHook<'init'>(checkForUpdates, {
        config,
      })

      expect(mockResolveUpdateTarget).not.toHaveBeenCalled()
      expect(stderr).toContain('Update available')
      expect(stderr).toContain('999.0.0')
      expect(stderr).toContain(expectedCommand)
    },
  )

  test('fires notification under a runner when the installed package is `sanity` and its version is stale', async () => {
    const {config} = await getCommandAndConfig('help')
    process.argv[1] = '/home/user/.cache/pnpm/dlx/abc/node_modules/.bin/sanity'
    mockResolveRunnerPackage.mockResolvedValue({
      installedVersion: '5.21.0',
      packageName: 'sanity',
    })
    setCachedLatestVersion({
      key: 'latestVersion:sanity',
      latestVersion: '5.22.0',
    })

    const {stderr} = await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockResolveUpdateTarget).not.toHaveBeenCalled()
    expect(stderr).toContain('Update available')
    expect(stderr).toContain('5.21.0')
    expect(stderr).toContain('5.22.0')
    expect(stderr).toContain('pnpm dlx sanity@latest')
  })

  test('uses cwd-based resolution when not running from a temporary runner', async () => {
    const {config} = await getCommandAndConfig('help')
    process.argv[1] = '/home/user/project/node_modules/.bin/sanity'

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockResolveUpdateTarget).toHaveBeenCalled()
  })

  test('spawns worker when no cached version exists', async () => {
    const {config} = await getCommandAndConfig('help')

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockResolveUpdateTarget).toHaveBeenCalledWith(process.cwd(), config.version)
    expect(mockDebug).toHaveBeenCalledWith('No cached update info, spawning worker to fetch')
    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('fetchUpdateInfo.worker')],
      expect.objectContaining({
        detached: true,
        env: expect.objectContaining({
          SANITY_UPDATE_CHECK_CLI_VERSION: config.version,
          SANITY_UPDATE_CHECK_CWD: process.cwd(),
          SANITY_UPDATE_CHECK_PACKAGE: 'sanity',
        }),
        stdio: 'ignore',
      }),
    )
  })

  test('spawns worker with runner-resolved package name when invoked via a runner with an expired cache', async () => {
    const {config} = await getCommandAndConfig('help')
    process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/sanity'

    setCachedLatestVersion({
      key: 'latestVersion:@sanity/cli',
      latestVersion: '999.0.0',
      updatedAt: Date.now() - 13 * 60 * 60 * 1000,
    })

    await testHook<'init'>(checkForUpdates, {config})

    expect(mockResolveUpdateTarget).not.toHaveBeenCalled()
    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('fetchUpdateInfo.worker')],
      expect.objectContaining({
        env: expect.objectContaining({
          SANITY_UPDATE_CHECK_PACKAGE: '@sanity/cli',
        }),
      }),
    )
  })

  test('spawns worker with runner-resolved package name when invoked via a runner with no cache', async () => {
    const {config} = await getCommandAndConfig('help')
    process.argv[1] = '/home/user/.npm/_npx/abc/node_modules/.bin/sanity'

    await testHook<'init'>(checkForUpdates, {config})

    expect(mockResolveUpdateTarget).not.toHaveBeenCalled()
    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('fetchUpdateInfo.worker')],
      expect.objectContaining({
        env: expect.objectContaining({
          SANITY_UPDATE_CHECK_PACKAGE: '@sanity/cli',
        }),
      }),
    )
  })

  test('shows notification and spawns worker when cache has expired', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {config} = await getCommandAndConfig('help')

    // Set cache to 13 hours ago (beyond the 12-hour TTL)
    setCachedLatestVersion({
      latestVersion: '999.0.0',
      updatedAt: Date.now() - 13 * 60 * 60 * 1000,
    })

    const {stderr} = await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Update is available (%s)', '999.0.0')
    expect(stderr).toContain('Update available')
    expect(stderr).toContain('999.0.0')
    expect(mockDebug).toHaveBeenCalledWith('Cache expired, spawning worker to refresh')
    expect(mockSpawn).toHaveBeenCalled()
  })

  test('shows notification when cache has update available', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {config} = await getCommandAndConfig('help')

    setCachedLatestVersion({
      latestVersion: '999.0.0',
    })

    const {stderr} = await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Update is available (%s)', '999.0.0')
    expect(stderr).toContain('Update available')
    expect(stderr).toContain('999.0.0')
    expect(stderr).toContain('pnpm update sanity')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  test('does not show notification when versions match', async () => {
    const {config} = await getCommandAndConfig('help')

    setCachedLatestVersion({
      latestVersion: '3.60.0',
    })

    const {stderr} = await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('No update found')
    expect(stderr).not.toContain('Update available')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  test('does not show notification when remote version older than local', async () => {
    const {config} = await getCommandAndConfig('help')

    setCachedLatestVersion({
      latestVersion: '1.0.0',
    })

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('No update found')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  test('reads correct cache key based on resolved package', async () => {
    const {config} = await getCommandAndConfig('help')

    mockResolveUpdateTarget.mockResolvedValue({
      installedVersion: '6.3.0',
      packageName: '@sanity/cli',
    })

    setCachedLatestVersion({
      key: 'latestVersion:@sanity/cli',
      latestVersion: '6.4.0',
    })

    const {stderr} = await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Update is available (%s)', '6.4.0')
    expect(stderr).toContain('Update available')
    expect(stderr).toContain('6.4.0')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  test('ignores cache for other package when project uses different package', async () => {
    const {config} = await getCommandAndConfig('help')

    // Project uses @sanity/cli
    mockResolveUpdateTarget.mockResolvedValue({
      installedVersion: '6.3.0',
      packageName: '@sanity/cli',
    })

    // But cache only has entry for sanity (from another project)
    setCachedLatestVersion({
      key: 'latestVersion:sanity',
      latestVersion: '999.0.0',
    })

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    // Should NOT show notification - the sanity cache is irrelevant to this project
    expect(mockDebug).toHaveBeenCalledWith('No cached update info, spawning worker to fetch')
    expect(mockSpawn).toHaveBeenCalled()
  })

  test('shows yarn global add command when globally installed via yarn', async () => {
    mockIsInstalledGlobally.default = true
    mockIsInstalledUsingYarn.mockReturnValue(true)

    const {config} = await getCommandAndConfig('help')

    setCachedLatestVersion({
      latestVersion: '999.0.0',
    })

    const {stderr} = await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Update is available (%s)', '999.0.0')
    expect(stderr).toContain('Update available')
    expect(stderr).toContain('999.0.0')
    expect(stderr).toContain('yarn global add sanity')
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})

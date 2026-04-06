import {getUserConfig, isCi} from '@sanity/cli-core'
import {testFixture, testHook} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getCommandAndConfig} from '../../../../test/helpers/getCommandAndConfig.js'
import {type SanityPackage} from '../../../util/packageManager/installationInfo/types.js'
import {checkForUpdates} from '../checkForUpdates.js'

const mockDebug = vi.hoisted(() => Object.assign(vi.fn(), {enabled: false}))
const mockSpawn = vi.hoisted(() => vi.fn())
const mockIsInstalledGlobally = vi.hoisted(() => ({default: false}))
const mockIsInstalledUsingYarn = vi.hoisted(() => vi.fn())

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

const mockIsCi = vi.mocked(isCi)
const originalIsTTY = process.stdout.isTTY
const originalArgv1 = process.argv[1]

function setCachedUpdateInfo(options: {
  installedVersion: string
  key?: string
  latestVersion: string
  packageName: SanityPackage
  updatedAt?: number
}): void {
  const {
    installedVersion,
    key = 'latestVersion:sanity',
    latestVersion,
    packageName,
    updatedAt = Date.now(),
  } = options

  const userConfig = getUserConfig()
  userConfig.set(key, {
    updatedAt,
    value: JSON.stringify({installedVersion, latestVersion, packageName}),
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
    process.stdout.isTTY = true
    process.argv[1] = originalArgv1

    mockConfigStore.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.stdout.isTTY = originalIsTTY
    process.argv[1] = originalArgv1 ?? ''
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
  })

  test('returns early if not TTY', async () => {
    const {config} = await getCommandAndConfig('help')
    process.stdout.isTTY = false

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockSpawn).not.toHaveBeenCalled()
  })

  test('returns early if running from temporary npx cache', async () => {
    const {config} = await getCommandAndConfig('help')
    process.argv[1] = '/home/user/.npm/_npx/abc123/node_modules/.bin/sanity'

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith(
      'Running from temporary npx download, skipping update check',
    )
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  test('does NOT skip npx when resolving to local install', async () => {
    const {config} = await getCommandAndConfig('help')
    process.argv[1] = '/home/user/project/node_modules/.bin/sanity'

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    // Should not have been skipped - either spawns worker or reads cache
    expect(mockDebug).not.toHaveBeenCalledWith(
      'Running from temporary npx download, skipping update check',
    )
  })

  test('spawns worker when no cached version exists', async () => {
    const {config} = await getCommandAndConfig('help')

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('No cached update info, spawning worker to fetch')
    expect(mockSpawn).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringContaining('fetchUpdateInfo.worker')],
      expect.objectContaining({
        detached: true,
        env: expect.objectContaining({
          SANITY_UPDATE_CHECK_CLI_VERSION: config.version,
          SANITY_UPDATE_CHECK_CWD: process.cwd(),
        }),
        stdio: 'ignore',
      }),
    )
  })

  test('spawns worker when cache has expired', async () => {
    const {config} = await getCommandAndConfig('help')

    // Set cache to 13 hours ago (beyond the 12-hour TTL)
    setCachedUpdateInfo({
      installedVersion: config.version,
      latestVersion: '999.0.0',
      packageName: 'sanity',
      updatedAt: Date.now() - 13 * 60 * 60 * 1000,
    })

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Cache expired, spawning worker to refresh')
    expect(mockSpawn).toHaveBeenCalled()
  })

  test('shows notification when cache has update available', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {config} = await getCommandAndConfig('help')

    setCachedUpdateInfo({
      installedVersion: config.version,
      latestVersion: '999.0.0',
      packageName: 'sanity',
    })

    const {stderr} = await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Update is available (%s)', '999.0.0')
    expect(stderr).toContain('Update available')
    expect(stderr).toContain('999.0.0')
    expect(stderr).toContain('pnpm')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  test('does not show notification when versions match', async () => {
    const {config} = await getCommandAndConfig('help')

    setCachedUpdateInfo({
      installedVersion: config.version,
      latestVersion: config.version,
      packageName: 'sanity',
    })

    const {stderr} = await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('No update found')
    expect(stderr).not.toContain('Update available')
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  test('shows yarn global add command when globally installed via yarn', async () => {
    mockIsInstalledGlobally.default = true
    mockIsInstalledUsingYarn.mockReturnValue(true)

    const {config} = await getCommandAndConfig('help')

    setCachedUpdateInfo({
      installedVersion: config.version,
      latestVersion: '999.0.0',
      packageName: 'sanity',
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

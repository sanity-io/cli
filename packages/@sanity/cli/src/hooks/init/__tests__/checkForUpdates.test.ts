import {getUserConfig, isCi} from '@sanity/cli-core'
import {testFixture, testHook} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getCommandAndConfig} from '../../../../test/helpers/getCommandAndConfig.js'
import {checkForUpdates} from '../checkForUpdates.js'

const mockDebug = vi.hoisted(() => vi.fn())
const mockGetLatestVersion = vi.hoisted(() => vi.fn())
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

vi.mock('@sanity/cli-core', async () => ({
  ...(await vi.importActual('@sanity/cli-core')),
  getUserConfig: mockGetUserConfig,
  isCi: vi.fn(),
  subdebug: vi.fn(() => mockDebug),
}))

vi.mock('get-latest-version', () => ({
  getLatestVersion: mockGetLatestVersion,
}))

vi.mock('is-installed-globally', () => mockIsInstalledGlobally)

vi.mock('../../../util/update/isInstalledUsingYarn.js', () => ({
  isInstalledUsingYarn: mockIsInstalledUsingYarn,
}))

const mockIsCi = vi.mocked(isCi)
const originalIsTTY = process.stdout.isTTY

describe('#checkForUpdates', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.unstubAllEnvs()
    mockIsCi.mockReturnValue(false)
    mockIsInstalledGlobally.default = false
    mockIsInstalledUsingYarn.mockReturnValue(false)
    process.stdout.isTTY = true

    mockConfigStore.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    process.stdout.isTTY = originalIsTTY
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
    expect(mockGetLatestVersion).not.toHaveBeenCalled()
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
    expect(mockGetLatestVersion).not.toHaveBeenCalled()
  })

  test('returns early if not TTY', async () => {
    const {config} = await getCommandAndConfig('help')
    process.stdout.isTTY = false

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockGetLatestVersion).not.toHaveBeenCalled()
  })

  test('skips latest update check if checked within last 12 hours', async () => {
    const {config} = await getCommandAndConfig('help')
    const now = Date.now()
    const recentTimestamp = now - 1000 * 60 * 60 * 6 // 6 hours ago

    const userConfig = getUserConfig()
    userConfig.set('cliLatestRemoteVersion', {
      updatedAt: recentTimestamp,
      value: '1.0.0',
    })

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith(
      'Less than 12 hours since last check, skipping update check',
    )
    expect(mockGetLatestVersion).not.toHaveBeenCalled()
  })

  test('checks for latest update and updates cache', async () => {
    const {config} = await getCommandAndConfig('help')

    mockGetLatestVersion.mockResolvedValueOnce('1.1.0')

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Checking for latest remote version')
    expect(mockGetLatestVersion).toHaveBeenCalledWith('@sanity/cli')
    expect(mockDebug).toHaveBeenCalledWith('Latest remote version is %s', '1.1.0')

    const userConfig = getUserConfig()
    const cachedVersion = userConfig.get('cliLatestRemoteVersion')
    expect(cachedVersion).toMatchObject({
      updatedAt: expect.any(Number),
      value: '1.1.0',
    })
  })

  test('skips updating cache when latest version check timesout', async () => {
    const {config} = await getCommandAndConfig('help')

    mockGetLatestVersion.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('1.1.0'), 500)),
    )

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Checking for latest remote version')
    expect(mockGetLatestVersion).toHaveBeenCalled()
    expect(mockDebug).toHaveBeenCalledWith(
      expect.stringContaining('Max time 300 reached waiting for latest version info'),
    )

    const userConfig = getUserConfig()
    const cachedVersion = userConfig.get('cliLatestRemoteVersion')
    expect(cachedVersion).toBeUndefined()
  })

  test('skips updating cache when latest version check fails', async () => {
    const {config} = await getCommandAndConfig('help')

    const error = new Error('Network error')
    mockGetLatestVersion.mockRejectedValueOnce(error)

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Checking for latest remote version')
    expect(mockGetLatestVersion).toHaveBeenCalled()
    expect(mockDebug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch latest version of @sanity/cli from npm:'),
    )

    const userConfig = getUserConfig()
    const cachedVersion = userConfig.get('cliLatestRemoteVersion')
    expect(cachedVersion).toBeUndefined()
  })

  test('returns early if no cached version found', async () => {
    const {config} = await getCommandAndConfig('help')

    // No cache set up - will check but get empty version
    mockGetLatestVersion.mockResolvedValueOnce('')

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('No cached latest version result found')
  })

  test('returns early if remote version older than local', async () => {
    const {config} = await getCommandAndConfig('help')
    const now = Date.now()
    const recentTimestamp = now - 1000 * 60 * 60 * 6 // 6 hours ago

    const userConfig = getUserConfig()
    userConfig.set('cliLatestRemoteVersion', {
      updatedAt: recentTimestamp,
      value: '1.0.0', // older than current
    })

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Remote version older than local')
  })

  test('returns early if remote and local version are the same', async () => {
    const {config} = await getCommandAndConfig('help')
    const now = Date.now()
    const recentTimestamp = now - 1000 * 60 * 60 * 6 // 6 hours ago

    const userConfig = getUserConfig()
    userConfig.set('cliLatestRemoteVersion', {
      updatedAt: recentTimestamp,
      value: config.version, // same as current
    })

    await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('No update found')
  })

  test('shows notification update', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {config} = await getCommandAndConfig('help')

    // Mock fetching new version
    mockGetLatestVersion.mockResolvedValueOnce('999.0.0')

    const {stderr} = await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Update is available (%s)', '999.0.0')
    expect(stderr).toContain('Update available')
    expect(stderr).toContain('999.0.0')
    expect(stderr).toContain('pnpm')
  })

  test('does not show notification when cache is hit', async () => {
    const {config} = await getCommandAndConfig('help')
    const now = Date.now()
    const recentTimestamp = now - 1000 * 60 * 60 * 6 // 6 hours ago

    const userConfig = getUserConfig()
    userConfig.set('cliLatestRemoteVersion', {
      updatedAt: recentTimestamp,
      value: '999.0.0', // newer than current
    })

    const {stderr} = await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith(
      'Less than 12 hours since last check, skipping update check',
    )
    expect(mockDebug).toHaveBeenCalledWith('Update is available (%s)', '999.0.0')
    expect(stderr).not.toContain('Update available')
  })

  test('shows yarn global add command when globally installed via yarn', async () => {
    mockIsInstalledGlobally.default = true
    mockIsInstalledUsingYarn.mockReturnValue(true)

    const {config} = await getCommandAndConfig('help')

    // Mock fetching new version
    mockGetLatestVersion.mockResolvedValueOnce('999.0.0')

    const {stderr} = await testHook<'init'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Update is available (%s)', '999.0.0')
    expect(stderr).toContain('Update available')
    expect(stderr).toContain('999.0.0')
    expect(stderr).toContain('yarn global add sanity')
  })
})

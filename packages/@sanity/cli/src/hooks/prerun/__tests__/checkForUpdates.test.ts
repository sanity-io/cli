import {isCi} from '@sanity/cli-core'
import {testFixture, testHook} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'
import {getCommandAndConfig} from '~test/helpers/getCommandAndConfig.js'

import {checkForUpdates} from '../checkForUpdates.js'

const mockDebug = vi.hoisted(() => vi.fn())
const mockGetUserConfigGet = vi.hoisted(() => vi.fn())
const mockGetUserConfigSet = vi.hoisted(() => vi.fn())
const mockGetLatestVersion = vi.hoisted(() => vi.fn())

// Mock dependencies
vi.mock('@sanity/cli-core', async () => ({
  ...(await vi.importActual('@sanity/cli-core')),
  getUserConfig: vi.fn(() => ({
    get: mockGetUserConfigGet,
    set: mockGetUserConfigSet,
  })),
  isCi: vi.fn(),
  subdebug: vi.fn(() => mockDebug),
}))

vi.mock('get-latest-version', () => ({
  default: mockGetLatestVersion,
}))

const mockIsCi = vi.mocked(isCi)

let originalEnv: Record<string, string>

describe('#checkForUpdates', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.unstubAllEnvs()
    originalEnv = {...process.env} as Record<string, string>
    mockIsCi.mockReturnValue(false)
    process.stdout.isTTY = true
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('returns early if running on CI', async () => {
    const {config} = await getCommandAndConfig('help')
    mockIsCi.mockReturnValue(true)

    await testHook<'prerun'>(checkForUpdates, {
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

    await testHook<'prerun'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith(
      'Running on CI, or explicitly disabled, skipping update check',
    )
    expect(mockGetLatestVersion).not.toHaveBeenCalled()
  })

  test('returns early if not TTY', async () => {
    const {config} = await getCommandAndConfig('help')
    const originalIsTTY = process.stdout.isTTY
    process.stdout.isTTY = false

    await testHook<'prerun'>(checkForUpdates, {
      config,
    })

    expect(mockGetLatestVersion).not.toHaveBeenCalled()

    process.stdout.isTTY = originalIsTTY
  })

  test('skips latest update check if checked within last 12 hours', async () => {
    const {config} = await getCommandAndConfig('help')
    const now = Date.now()
    const lastChecked = now - 1000 * 60 * 60 * 6 // 6 hours ago

    mockGetUserConfigGet.mockReturnValueOnce({
      lastChecked,
      latestVersion: '1.0.0',
    })

    await testHook<'prerun'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith(
      'Less than 12 hours since last check, skipping update check',
    )
    expect(mockGetLatestVersion).not.toHaveBeenCalled()
  })

  test('checks for latest update and updates cache', async () => {
    const {config} = await getCommandAndConfig('help')
    const now = Date.now()
    const lastChecked = now - 1000 * 60 * 60 * 13 // 13 hours ago
    const lastNotified = now - 1000 * 60 * 60 * 13 // 13 hours ago (won't block notification check)

    // Cache is old, should check for update
    mockGetUserConfigGet.mockReturnValueOnce({
      lastChecked,
      lastNotified,
      latestVersion: '1.0.0',
    })

    mockGetLatestVersion.mockResolvedValueOnce('1.1.0')

    await testHook<'prerun'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Checking for latest remote version')
    expect(mockGetLatestVersion).toHaveBeenCalledWith('@sanity/cli')
    expect(mockDebug).toHaveBeenCalledWith('Latest remote version is %s', '1.1.0')
    expect(mockGetUserConfigSet).toHaveBeenCalledWith(
      'updateCheck',
      expect.objectContaining({
        lastChecked: expect.any(Number),
        lastNotified,
        latestVersion: '1.1.0',
      }),
    )
  })

  test('skips updating cache when latest version check timesout', async () => {
    const {config} = await getCommandAndConfig('help')
    const now = Date.now()

    // Cache is old, should check for update
    mockGetUserConfigGet.mockReturnValueOnce({
      lastChecked: now - 1000 * 60 * 60 * 13, // 13 hours ago
      latestVersion: '1.0.0',
    })

    // Simulate timeout - Promise.race will resolve to null after 300ms
    mockGetLatestVersion.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('1.1.0'), 500)),
    )

    await testHook<'prerun'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Checking for latest remote version')
    expect(mockGetLatestVersion).toHaveBeenCalled()
    expect(mockDebug).toHaveBeenCalledWith(
      'Max time (%dms) reached waiting for latest version info',
      300,
    )
    expect(mockGetUserConfigSet).not.toHaveBeenCalled()
  })

  test('skips updating cache when latest version check fails', async () => {
    const {config} = await getCommandAndConfig('help')
    const now = Date.now()

    // Cache is old, should check for update
    mockGetUserConfigGet.mockReturnValueOnce({
      lastChecked: now - 1000 * 60 * 60 * 13, // 13 hours ago
      latestVersion: '1.0.0',
    })

    // Simulate error from npm fetch
    const error = new Error('Network error')
    mockGetLatestVersion.mockRejectedValueOnce(error)

    await testHook<'prerun'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Checking for latest remote version')
    expect(mockGetLatestVersion).toHaveBeenCalled()
    expect(mockDebug).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch latest version of @sanity/cli from npm:'),
    )
    expect(mockGetUserConfigSet).not.toHaveBeenCalled()
  })

  test('returns early if notified within last 12 hours', async () => {
    const {config} = await getCommandAndConfig('help')
    const now = Date.now()

    mockGetUserConfigGet.mockReturnValueOnce({
      lastChecked: now - 1000 * 60 * 60 * 6, // 6 hours ago (skip version check)
      lastNotified: now - 1000 * 60 * 60 * 6, // 6 hours ago
      latestVersion: '1.1.0',
    })

    await testHook<'prerun'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Less than 12 hours since last nag, skipping')
  })

  test('returns early if no cached version found', async () => {
    const {config} = await getCommandAndConfig('help')
    const now = Date.now()

    mockGetUserConfigGet.mockReturnValueOnce({
      lastChecked: now - 1000 * 60 * 60 * 6, // 6 hours ago (skip version check)
      latestVersion: '', // no cached version
    })

    await testHook<'prerun'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('No cached latest version result found')
  })

  test('returns early if remote version older than local', async () => {
    const {config} = await getCommandAndConfig('help')
    const now = Date.now()

    // Config version will be something like '3.0.0' (current CLI version)
    // Set cached version to something older
    mockGetUserConfigGet.mockReturnValueOnce({
      lastChecked: now - 1000 * 60 * 60 * 6, // 6 hours ago (skip version check)
      latestVersion: '1.0.0', // older than current
    })

    await testHook<'prerun'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Remote version older than local')
  })

  test('returns early if remote and local version are the same', async () => {
    const {config} = await getCommandAndConfig('help')
    const now = Date.now()

    // Set cached version to match current config version
    mockGetUserConfigGet.mockReturnValueOnce({
      lastChecked: now - 1000 * 60 * 60 * 6, // 6 hours ago (skip version check)
      latestVersion: config.version, // same as current
    })

    await testHook<'prerun'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('No update found')
  })

  test('shows notification update', async () => {
    const cwd = await testFixture('basic-studio')
    process.chdir(cwd)

    const {config} = await getCommandAndConfig('help')
    const now = Date.now()

    // Set up cache to trigger notification
    mockGetUserConfigGet.mockReturnValueOnce({
      lastChecked: now - 1000 * 60 * 60 * 6, // 6 hours ago (skip version check)
      lastNotified: now - 1000 * 60 * 60 * 13, // 13 hours ago (allow notification)
      latestVersion: '999.0.0', // newer than current
    })

    const {stderr} = await testHook<'prerun'>(checkForUpdates, {
      config,
    })

    expect(mockDebug).toHaveBeenCalledWith('Update is available (%s)', '999.0.0')
    expect(stderr).toContain('Update available')
    expect(stderr).toContain('999.0.0')
    expect(stderr).toContain('pnpm')
    expect(mockGetUserConfigSet).toHaveBeenCalledWith(
      'updateCheck',
      expect.objectContaining({
        lastNotified: expect.any(Number),
      }),
    )
  })
})

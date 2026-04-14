import {afterEach, describe, expect, test, vi} from 'vitest'

const mockGetLatestVersion = vi.hoisted(() => vi.fn())
const mockResolveUpdateTarget = vi.hoisted(() => vi.fn())
const mockPromiseRaceWithTimeout = vi.hoisted(() => vi.fn())
const mockConfigStore = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}))

vi.mock('@sanity/cli-core', async () => ({
  ...(await vi.importActual('@sanity/cli-core')),
  getUserConfig: vi.fn(() => mockConfigStore),
  subdebug: vi.fn(() => vi.fn()),
}))

vi.mock('get-latest-version', () => ({
  getLatestVersion: mockGetLatestVersion,
}))

vi.mock('../resolveUpdateTarget.js', () => ({
  resolveUpdateTarget: mockResolveUpdateTarget,
}))

vi.mock('../../promiseRaceWithTimeout.js', () => ({
  promiseRaceWithTimeout: mockPromiseRaceWithTimeout,
}))

// Import from the non-worker module (fetchUpdateInfo.ts) rather than the worker bundle.
// Worker files (*.worker.ts) are bundled by esbuild with internal deps inlined,
// which prevents vi.mock() from intercepting them. The core logic lives in
// fetchUpdateInfo.ts so we can mock its dependencies normally.
const {runFetchWorker} = await import('../fetchUpdateInfo.js')

describe('runFetchWorker', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('fetches latest version and caches it', async () => {
    const target = {installedVersion: '3.60.0', packageName: 'sanity'}
    mockResolveUpdateTarget.mockResolvedValue(target)
    mockGetLatestVersion.mockResolvedValue('3.61.0')
    mockPromiseRaceWithTimeout.mockResolvedValue('3.61.0')

    const before = Date.now()
    await runFetchWorker('/fake/project', '6.3.1')
    const after = Date.now()

    expect(mockResolveUpdateTarget).toHaveBeenCalledWith('/fake/project', '6.3.1')
    expect(mockPromiseRaceWithTimeout).toHaveBeenCalledWith(expect.anything(), 15_000)
    expect(mockConfigStore.set).toHaveBeenCalledOnce()

    const [cacheKey, cacheValue] = mockConfigStore.set.mock.calls[0]
    expect(cacheKey).toBe('latestVersion:sanity')
    expect(cacheValue.updatedAt).toBeGreaterThanOrEqual(before)
    expect(cacheValue.updatedAt).toBeLessThanOrEqual(after)
    expect(cacheValue.value).toBe('3.61.0')
  })

  test('uses @sanity/cli cache key when sanity is not a local dependency', async () => {
    const target = {installedVersion: '6.3.1', packageName: '@sanity/cli'}
    mockResolveUpdateTarget.mockResolvedValue(target)
    mockGetLatestVersion.mockResolvedValue('6.4.0')
    mockPromiseRaceWithTimeout.mockResolvedValue('6.4.0')

    await runFetchWorker('/fake/project', '6.3.1')

    expect(mockConfigStore.set).toHaveBeenCalledOnce()

    const [cacheKey, cacheValue] = mockConfigStore.set.mock.calls[0]
    expect(cacheKey).toBe('latestVersion:@sanity/cli')
    expect(cacheValue.value).toBe('6.4.0')
  })

  test('does not write to cache if fetch fails', async () => {
    const target = {installedVersion: '3.60.0', packageName: 'sanity'}
    mockResolveUpdateTarget.mockResolvedValue(target)
    mockPromiseRaceWithTimeout.mockRejectedValue(new Error('Network error'))

    const error = await runFetchWorker('/fake/project', '6.3.1').catch((err: unknown) => err)

    expect(error).toBeInstanceOf(Error)
    expect(mockConfigStore.set).not.toHaveBeenCalled()
  })

  test('does not write to cache if fetch times out', async () => {
    const target = {installedVersion: '3.60.0', packageName: 'sanity'}
    mockResolveUpdateTarget.mockResolvedValue(target)
    mockPromiseRaceWithTimeout.mockResolvedValue(null)

    await runFetchWorker('/fake/project', '6.3.1')

    expect(mockPromiseRaceWithTimeout).toHaveBeenCalledOnce()
    expect(mockConfigStore.set).not.toHaveBeenCalled()
  })
})

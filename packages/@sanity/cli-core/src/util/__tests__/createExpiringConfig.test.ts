import type ConfigStore from 'configstore'

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {createExpiringConfig} from '../createExpiringConfig.js'

describe('createExpiringConfig', () => {
  let mockStore: ConfigStore
  let fetchValue: ReturnType<typeof vi.fn>
  let onCacheHit: ReturnType<typeof vi.fn>
  let onFetch: ReturnType<typeof vi.fn>
  let onRevalidate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Mock ConfigStore
    mockStore = {
      delete: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    } as unknown as ConfigStore

    // Reset all mocks
    fetchValue = vi.fn()
    onCacheHit = vi.fn()
    onFetch = vi.fn()
    onRevalidate = vi.fn()
  })

  test('returns fetched value when cache is empty', async () => {
    const testValue = 'test-value'
    const config = createExpiringConfig({
      fetchValue: fetchValue.mockResolvedValue(testValue),
      key: 'test-key',
      onCacheHit,
      onFetch,
      onRevalidate,
      store: mockStore,
      ttl: 5000,
    })

    // Mock empty cache
    vi.mocked(mockStore.get).mockReturnValue(undefined)

    const result = await config.get()

    expect(result).toBe(testValue)
    expect(fetchValue).toHaveBeenCalledOnce()
    expect(onFetch).toHaveBeenCalledOnce()
    expect(onCacheHit).not.toHaveBeenCalled()
    expect(onRevalidate).not.toHaveBeenCalled()
    expect(mockStore.set).toHaveBeenCalledWith('test-key', {
      updatedAt: expect.any(Number),
      value: testValue,
    })
  })

  test('returns cached value when it has not expired', async () => {
    const cachedValue = 'cached-value'
    const ttl = 5000
    const updatedAt = Date.now() - 1000 // 1 second ago (not expired)

    const config = createExpiringConfig({
      fetchValue,
      key: 'test-key',
      onCacheHit,
      onFetch,
      onRevalidate,
      store: mockStore,
      ttl,
    })

    // Mock cached value that hasn't expired
    vi.mocked(mockStore.get).mockReturnValue({
      updatedAt,
      value: cachedValue,
    })

    const result = await config.get()

    expect(result).toBe(cachedValue)
    expect(fetchValue).not.toHaveBeenCalled()
    expect(onCacheHit).toHaveBeenCalledOnce()
    expect(onFetch).not.toHaveBeenCalled()
    expect(onRevalidate).not.toHaveBeenCalled()
    expect(mockStore.set).not.toHaveBeenCalled()
  })

  test('fetches new value when cached value has expired', async () => {
    const newValue = 'new-value'
    const ttl = 1000
    const updatedAt = Date.now() - 2000 // 2 seconds ago (expired)

    const config = createExpiringConfig({
      fetchValue: fetchValue.mockResolvedValue(newValue),
      key: 'test-key',
      onCacheHit,
      onFetch,
      onRevalidate,
      store: mockStore,
      ttl,
    })

    // Mock expired cached value
    vi.mocked(mockStore.get).mockReturnValue({
      updatedAt,
      value: 'old-value',
    })

    const result = await config.get()

    expect(result).toBe(newValue)
    expect(fetchValue).toHaveBeenCalledOnce()
    expect(onRevalidate).toHaveBeenCalledOnce()
    expect(onFetch).toHaveBeenCalledOnce()
    expect(onCacheHit).not.toHaveBeenCalled()
    expect(mockStore.set).toHaveBeenCalledWith('test-key', {
      updatedAt: expect.any(Number),
      value: newValue,
    })
  })

  test('deletes cached value from store', () => {
    const config = createExpiringConfig({
      fetchValue,
      key: 'test-key',
      store: mockStore,
      ttl: 5000,
    })

    config.delete()

    expect(mockStore.delete).toHaveBeenCalledWith('test-key')
  })

  test('handles concurrent get() calls correctly', async () => {
    const testValue = 'test-value'
    let resolvePromise: (value: string) => void
    const delayedFetch = new Promise<string>((resolve) => {
      resolvePromise = resolve
    })

    const config = createExpiringConfig({
      fetchValue: fetchValue.mockReturnValue(delayedFetch),
      key: 'test-key',
      onFetch,
      store: mockStore,
      ttl: 5000,
    })

    // Mock empty cache
    vi.mocked(mockStore.get).mockReturnValue(undefined)

    // Start multiple concurrent get() calls
    const promise1 = config.get()
    const promise2 = config.get()
    const promise3 = config.get()

    // Resolve the fetch
    resolvePromise!(testValue)

    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3])

    expect(result1).toBe(testValue)
    expect(result2).toBe(testValue)
    expect(result3).toBe(testValue)
    expect(fetchValue).toHaveBeenCalledOnce() // Only one fetch should happen
    expect(onFetch).toHaveBeenCalledOnce()
  })

  test('handles synchronous fetchValue function', async () => {
    const testValue = 'sync-value'
    const syncFetchValue = vi.fn().mockReturnValue(testValue)

    const config = createExpiringConfig({
      fetchValue: syncFetchValue,
      key: 'test-key',
      store: mockStore,
      ttl: 5000,
    })

    // Mock empty cache
    vi.mocked(mockStore.get).mockReturnValue(undefined)

    const result = await config.get()

    expect(result).toBe(testValue)
    expect(syncFetchValue).toHaveBeenCalledOnce()
  })

  test('handles fetchValue throwing an error', async () => {
    const error = new Error('Fetch failed')
    const config = createExpiringConfig({
      fetchValue: fetchValue.mockRejectedValue(error),
      key: 'test-key',
      store: mockStore,
      ttl: 5000,
    })

    // Mock empty cache
    vi.mocked(mockStore.get).mockReturnValue(undefined)

    await expect(config.get()).rejects.toThrow('Fetch failed')
    expect(fetchValue).toHaveBeenCalledOnce()
    expect(mockStore.set).not.toHaveBeenCalled()
  })

  test('handles different data types as cached values', async () => {
    const objectValue = {key: 'value', number: 42}
    const config = createExpiringConfig({
      fetchValue: fetchValue.mockResolvedValue(objectValue),
      key: 'test-key',
      store: mockStore,
      ttl: 5000,
    })

    // Mock empty cache
    vi.mocked(mockStore.get).mockReturnValue(undefined)

    const result = await config.get()

    expect(result).toEqual(objectValue)
    expect(mockStore.set).toHaveBeenCalledWith('test-key', {
      updatedAt: expect.any(Number),
      value: objectValue,
    })
  })

  test('works with TTL of 0 (immediate expiration)', async () => {
    const testValue = 'test-value'
    const config = createExpiringConfig({
      fetchValue: fetchValue.mockResolvedValue(testValue),
      key: 'test-key',
      onRevalidate,
      store: mockStore,
      ttl: 0,
    })

    // Mock cached value that would be immediately expired
    // Use a timestamp from 1ms ago to ensure it's > ttl (0)
    vi.mocked(mockStore.get).mockReturnValue({
      updatedAt: Date.now() - 1,
      value: 'old-value',
    })

    const result = await config.get()

    expect(result).toBe(testValue)
    expect(fetchValue).toHaveBeenCalledOnce()
    expect(onRevalidate).toHaveBeenCalledOnce()
  })

  test('works without optional callback functions', async () => {
    const testValue = 'test-value'
    const config = createExpiringConfig({
      fetchValue: fetchValue.mockResolvedValue(testValue),
      key: 'test-key',
      store: mockStore,
      ttl: 5000,
    })

    // Mock empty cache
    vi.mocked(mockStore.get).mockReturnValue(undefined)

    const result = await config.get()

    expect(result).toBe(testValue)
    expect(fetchValue).toHaveBeenCalledOnce()
  })

  test('handles cached value without updatedAt timestamp', async () => {
    const newValue = 'new-value'
    const config = createExpiringConfig({
      fetchValue: fetchValue.mockResolvedValue(newValue),
      key: 'test-key',
      onFetch,
      store: mockStore,
      ttl: 5000,
    })

    // Mock cached value without updatedAt (invalid cache entry)
    vi.mocked(mockStore.get).mockReturnValue({
      value: 'old-value',
      // updatedAt is missing
    })

    const result = await config.get()

    expect(result).toBe(newValue)
    expect(fetchValue).toHaveBeenCalledOnce()
    expect(onFetch).toHaveBeenCalledOnce()
  })

  test('handles cached value without value property', async () => {
    const newValue = 'new-value'
    const config = createExpiringConfig({
      fetchValue: fetchValue.mockResolvedValue(newValue),
      key: 'test-key',
      onFetch,
      store: mockStore,
      ttl: 5000,
    })

    // Mock cached entry without value property
    vi.mocked(mockStore.get).mockReturnValue({
      updatedAt: Date.now(),
      // value is missing
    })

    const result = await config.get()

    expect(result).toBe(newValue)
    expect(fetchValue).toHaveBeenCalledOnce()
    expect(onFetch).toHaveBeenCalledOnce()
  })

  test('stores timestamp correctly when caching new values', async () => {
    const testValue = 'test-value'

    const config = createExpiringConfig({
      fetchValue: fetchValue.mockResolvedValue(testValue),
      key: 'test-key',
      store: mockStore,
      ttl: 5000,
    })

    // Mock empty cache
    vi.mocked(mockStore.get).mockReturnValue(undefined)

    await config.get()

    expect(mockStore.set).toHaveBeenCalledWith('test-key', {
      updatedAt: expect.any(Number),
      value: testValue,
    })
  })

  test('subsequent requests after cache is populated use cached value', async () => {
    const testValue = 'test-value'
    const config = createExpiringConfig({
      fetchValue: fetchValue.mockResolvedValue(testValue),
      key: 'test-key',
      onCacheHit,
      onFetch,
      store: mockStore,
      ttl: 5000,
    })

    // Mock empty cache for first request
    vi.mocked(mockStore.get).mockReturnValueOnce(undefined)

    // First request should fetch
    const result1 = await config.get()

    // Mock cache populated for subsequent request
    vi.mocked(mockStore.get).mockReturnValueOnce({
      updatedAt: Date.now(),
      value: testValue,
    })

    // Second request should hit cache
    const result2 = await config.get()

    expect(result1).toBe(testValue)
    expect(result2).toBe(testValue)
    expect(fetchValue).toHaveBeenCalledOnce()
    expect(onFetch).toHaveBeenCalledOnce()
    expect(onCacheHit).toHaveBeenCalledOnce()
  })
})

import {beforeEach, describe, expect, test, vi} from 'vitest'

import {createExpiringConfig} from '../createExpiringConfig.js'

interface MockConfigStore {
  delete: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
}

describe('createExpiringConfig', () => {
  let mockStore: MockConfigStore
  let fetchValue: ReturnType<typeof vi.fn<() => unknown>>
  let onCacheHit: ReturnType<typeof vi.fn<() => void>>
  let onFetch: ReturnType<typeof vi.fn<() => void>>
  let onRevalidate: ReturnType<typeof vi.fn<() => void>>

  beforeEach(() => {
    mockStore = {
      delete: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
    }

    fetchValue = vi.fn<() => unknown>()
    onCacheHit = vi.fn<() => void>()
    onFetch = vi.fn<() => void>()
    onRevalidate = vi.fn<() => void>()
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

    mockStore.get.mockReturnValue(undefined)

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

    mockStore.get.mockReturnValue({
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

    mockStore.get.mockReturnValue({
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

    mockStore.get.mockReturnValue(undefined)

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

    mockStore.get.mockReturnValue(undefined)

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

    mockStore.get.mockReturnValue(undefined)

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

    mockStore.get.mockReturnValue(undefined)

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
    mockStore.get.mockReturnValue({
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

    mockStore.get.mockReturnValue(undefined)

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
    mockStore.get.mockReturnValue({
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
    mockStore.get.mockReturnValue({
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

    mockStore.get.mockReturnValue(undefined)

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
    mockStore.get.mockReturnValueOnce(undefined)

    // First request should fetch
    const result1 = await config.get()

    // Mock cache populated for subsequent request
    mockStore.get.mockReturnValueOnce({
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

  test('throws when cached value fails validateValue', async () => {
    const invalidCached = 123
    const ttl = 10_000

    const validateValue = vi.fn((v: unknown): v is string => typeof v === 'string')

    const config = createExpiringConfig<string>({
      fetchValue: fetchValue as () => Promise<string>,
      key: 'test-key',
      onCacheHit,
      onFetch,
      onRevalidate,
      store: mockStore,
      ttl,
      validateValue: validateValue as unknown as (value: unknown) => value is string,
    })

    // Cached entry that is not expired but invalid per validateValue
    mockStore.get.mockReturnValue({
      updatedAt: Date.now(),
      value: invalidCached,
    })

    await expect(config.get()).rejects.toThrow('Stored value is invalid')
    expect(validateValue).toHaveBeenCalledOnce()
    expect(onCacheHit).not.toHaveBeenCalled()
    expect(onFetch).not.toHaveBeenCalled()
    expect(onRevalidate).not.toHaveBeenCalled()
    expect(mockStore.set).not.toHaveBeenCalled()
  })

  test('throws when fetched value fails validateValue (cache miss)', async () => {
    const validateValue = vi.fn((v: unknown): v is string => typeof v === 'string')
    const config = createExpiringConfig<string>({
      fetchValue: fetchValue.mockResolvedValue(42 as unknown as string) as () => Promise<string>,
      key: 'test-key',
      onFetch,
      store: mockStore,
      ttl: 5000,
      validateValue: validateValue as unknown as (value: unknown) => value is string,
    })

    // Empty cache
    mockStore.get.mockReturnValue(undefined)

    await expect(config.get()).rejects.toThrow('Fetched value is invalid')
    expect(onFetch).toHaveBeenCalledOnce()
    expect(validateValue).toHaveBeenCalledOnce()
    expect(mockStore.set).not.toHaveBeenCalled()
  })

  test('returns cached value when validateValue accepts it', async () => {
    const cachedValue = 'ok'
    const validateValue = vi.fn((v: unknown): v is string => typeof v === 'string')
    const config = createExpiringConfig<string>({
      fetchValue: fetchValue as () => Promise<string>,
      key: 'test-key',
      onCacheHit,
      store: mockStore,
      ttl: 5000,
      validateValue: validateValue as unknown as (value: unknown) => value is string,
    })

    mockStore.get.mockReturnValue({
      updatedAt: Date.now(),
      value: cachedValue,
    })

    const result = await config.get()

    expect(result).toBe(cachedValue)
    expect(validateValue).toHaveBeenCalledOnce()
    expect(onCacheHit).toHaveBeenCalledOnce()
    expect(fetchValue).not.toHaveBeenCalled()
  })

  test('revalidation path validates fetched value and throws if invalid', async () => {
    const validateValue = vi.fn((v: unknown): v is string => typeof v === 'string')
    const config = createExpiringConfig<string>({
      fetchValue: fetchValue.mockResolvedValue(99 as unknown as string) as () => Promise<string>,
      key: 'test-key',
      onFetch,
      onRevalidate,
      store: mockStore,
      ttl: 1, // ensure expiration
      validateValue: validateValue as unknown as (value: unknown) => value is string,
    })

    // Cached value that has expired but is otherwise valid in shape and passes validate
    mockStore.get.mockReturnValue({
      updatedAt: Date.now() - 10,
      value: 'stale',
    })

    await expect(config.get()).rejects.toThrow('Fetched value is invalid')
    expect(onRevalidate).toHaveBeenCalledOnce()
    expect(onFetch).toHaveBeenCalledOnce()
    // validateValue called for stored value and fetched value
    expect(validateValue).toHaveBeenCalledTimes(2)
    expect(mockStore.set).not.toHaveBeenCalled()
  })
})

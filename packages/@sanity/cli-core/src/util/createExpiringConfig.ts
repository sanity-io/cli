import type ConfigStore from 'configstore'

export interface ExpiringConfigOptions<Type> {
  /** Fetch value */
  fetchValue: () => Promise<Type> | Type
  /** Config key */
  key: string
  /** Config store */
  store: ConfigStore
  /** TTL (milliseconds) */
  ttl: number

  /** Subscribe to cache hit event */
  onCacheHit?: () => void
  /** Subscribe to fetch event */
  onFetch?: () => void
  /** Subscribe to revalidate event */
  onRevalidate?: () => void
}

export interface ExpiringConfigApi<Type> {
  /**
   * Delete the cached value.
   */
  delete: () => void
  /**
   * Attempt to get the cached value. If there is no cached value, or the cached value has expired,
   * fetch, cache, and return the value.
   */
  get: () => Promise<Type>
}

/**
 * Create a config in the provided config store that expires after the provided TTL.
 */
export function createExpiringConfig<Type>({
  fetchValue,
  key,
  onCacheHit = () => null,
  onFetch = () => null,
  onRevalidate = () => null,
  store,
  ttl,
}: ExpiringConfigOptions<Type>): ExpiringConfigApi<Type> {
  let currentFetch: Promise<Type> | null = null
  return {
    delete() {
      store.delete(key)
    },
    async get() {
      const {updatedAt, value} = store.get(key) ?? {}

      if (value && updatedAt) {
        const hasExpired = Date.now() - updatedAt > ttl

        if (!hasExpired) {
          onCacheHit()
          return value
        }

        onRevalidate()
      }

      if (currentFetch) {
        return currentFetch
      }
      onFetch()

      currentFetch = Promise.resolve(fetchValue())
      const nextValue = await currentFetch
      currentFetch = null

      store.set(key, {
        updatedAt: Date.now(),
        value: nextValue,
      })

      return nextValue
    },
  }
}

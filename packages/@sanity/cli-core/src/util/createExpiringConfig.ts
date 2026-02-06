import type ConfigStore from 'configstore'

interface ExpiringConfigValue {
  updatedAt: number
  value: unknown
}

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

  /**
   * Assert the fetched value is valid, or throw if invalid.
   * If none is provided, it will always accept the fetched value.
   */
  validateValue?: (value: unknown) => value is Type
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
  validateValue = (value: unknown): value is Type => true,
}: ExpiringConfigOptions<Type>): ExpiringConfigApi<Type> {
  let currentFetch: Promise<Type> | null = null
  return {
    delete() {
      store.delete(key)
    },
    async get(): Promise<Type> {
      const stored = store.get(key)

      if (isExpiringValue(stored)) {
        const {updatedAt, value} = stored
        if (!validateValue(value)) {
          throw new Error('Stored value is invalid')
        }

        const hasExpired = Date.now() - updatedAt > ttl

        if (!hasExpired) {
          onCacheHit()
          return value
        }

        onRevalidate()
      }

      // Return existing fetch if one is already in progress
      if (currentFetch) {
        return currentFetch
      }

      onFetch()

      currentFetch = Promise.resolve(fetchValue())
      const nextValue = await currentFetch
      if (!validateValue(nextValue)) {
        throw new Error('Fetched value is invalid')
      }

      store.set(key, {
        updatedAt: Date.now(),
        value: nextValue,
      })

      currentFetch = null

      return nextValue
    },
  }
}

/**
 * Checks if the given stored value is valid (does not check if expired, only verified shape)
 *
 * @param stored - The stored value to check
 * @returns True if the stored value is valid
 * @internal
 */
function isExpiringValue(stored: unknown): stored is ExpiringConfigValue {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) {
    return false
  }

  if (!('updatedAt' in stored) || typeof stored.updatedAt !== 'number') {
    return false
  }

  if (!('value' in stored)) {
    return false
  }

  return true
}

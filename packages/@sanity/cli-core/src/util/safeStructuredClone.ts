/**
 * `structuredClone()`, but doesn't throw on non-clonable values - instead it drops them.
 *
 * @param obj - The object to clone.
 * @returns The cloned object.
 * @internal
 */
export function safeStructuredClone<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seen = new WeakMap<object, any>()

  function clone<T>(value: T): T {
    if (typeof value === 'function' || typeof value === 'symbol') {
      return undefined as unknown as T // Drop non-clonable values
    }
    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) return seen.get(value)

      if (value instanceof Date) return new Date(value) as T
      if (value instanceof RegExp) return new RegExp(value) as T
      if (value instanceof Set) return new Set([...value].map((item) => clone(item))) as T
      if (value instanceof Map)
        return new Map([...value.entries()].map(([k, v]) => [clone(k), clone(v)])) as T
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (ArrayBuffer.isView(value)) return new (value.constructor as any)(value) as T

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: any = Array.isArray(value) ? [] : {}
      seen.set(value, result)

      for (const key in value) {
        const clonedValue = clone(value[key])
        if (clonedValue !== undefined) result[key] = clonedValue
      }
      return result as T
    }
    return value
  }

  return clone(obj)
}

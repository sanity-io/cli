/**
 * Resolve any promises that are reachable in a single pass. Does not resolve the
 * resolvables of resolved promises. Does that make sense? Rejected promises are kept
 * as-is.
 *
 * @param thing - The thing to resolve - eg an object, an array etc.
 * @returns The same thing passed, cloned where needed, with promises resolved.
 */
export async function resolveAwaitables(thing: unknown) {
  async function recurse(value: unknown): Promise<unknown> {
    if (value instanceof Promise) {
      try {
        return await value
      } catch {
        return value // Leave rejected promises as they are
      }
    } else if (Array.isArray(value)) {
      return Promise.all(value.map((item) => recurse(item)))
    } else if (value && typeof value === 'object') {
      return Object.fromEntries(
        await Promise.all(
          Object.entries(value).map(async ([key, val]) => [key, await recurse(val)]),
        ),
      )
    }
    return value
  }

  return recurse(await thing)
}

import debugIt from 'debug'

/**
 * `debug` instance for the CLI
 *
 * @internal
 */
export const debug = debugIt('sanity:cli')

/**
 * Get a `debug` instance which extends the CLI debug instance with the given namespace,
 * eg namespace would be `sanity:cli:<providedNamespace>`
 *
 * @param namespace - The namespace to extend the CLI debug instance with
 * @returns The extended `debug` instance
 */
export const subdebug = (namespace: string) => debug.extend(namespace)

/**
 * Runtime equivalent of `DEBUG=sanity*`, for a `--debug` flag. Uses `sanity*`
 * (not `sanity:cli*`) so `@sanity/client` request logs show too, and keeps any
 * namespaces already enabled via `DEBUG`.
 * @internal
 */
export function enableDebug(): void {
  debugIt.enable([debugIt.disable(), 'sanity*'].filter(Boolean).join(','))
}

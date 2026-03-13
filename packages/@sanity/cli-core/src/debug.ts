import {createDebug} from '@sanity/debug'

/**
 * `debug` instance for the CLI
 *
 * @internal
 */
export const debug = createDebug('sanity:cli')

/**
 * Get a `debug` instance which extends the CLI debug instance with the given namespace,
 * eg namespace would be `sanity:cli:<providedNamespace>`
 *
 * @param namespace - The namespace to extend the CLI debug instance with
 * @returns The extended `debug` instance
 */
export const subdebug = (namespace: string) => debug.extend(namespace)

import debugIt from 'debug'

import {getCliExecutionContext} from '../executionContext.js'

/**
 * `debug` instance for the CLI
 *
 * @internal
 */
export const debug = debugIt('sanity:cli')

const defaultLog: (...args: unknown[]) => void = debugIt.log
debug.log = (...args: unknown[]) => {
  // DEBUG belongs to the embedding process, not to an individual invocation.
  // Suppress it inside the execution context so it cannot bypass output sinks or expose request details to unrelated host logs.
  if (getCliExecutionContext()) return
  defaultLog(...args)
}

/**
 * Get a `debug` instance which extends the CLI debug instance with the given namespace,
 * eg namespace would be `sanity:cli:<providedNamespace>`
 *
 * @param namespace - The namespace to extend the CLI debug instance with
 * @returns The extended `debug` instance
 */
export const subdebug = (namespace: string) => debug.extend(namespace)

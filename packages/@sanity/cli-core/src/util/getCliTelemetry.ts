import {ux} from '@oclif/core'
import {noopLogger} from '@sanity/telemetry'

import {type CLITelemetryStore} from '../telemetry/types.js'

/**
 * @public
 * Symbol used to store the CLI telemetry store on globalThis.
 * Use `getCliTelemetry()` to access the store instead of accessing this directly.
 */
export const CLI_TELEMETRY_SYMBOL = Symbol.for('sanity.cli.telemetry')

type GlobalWithTelemetry = typeof globalThis & {
  [CLI_TELEMETRY_SYMBOL]?: CLITelemetryStore
}

/**
 * @public
 */
export function getCliTelemetry(): CLITelemetryStore {
  const global = globalThis as GlobalWithTelemetry
  // This should never happen, but if it does, we return a noop logger to avoid errors.
  if (!global[CLI_TELEMETRY_SYMBOL]) {
    ux.warn('CLI telemetry not initialized, returning noop logger')
    return noopLogger
  }

  return global[CLI_TELEMETRY_SYMBOL]
}

/**
 * Sets the global CLI telemetry store.
 * @internal
 */
export function setCliTelemetry(telemetry: CLITelemetryStore): void {
  const global = globalThis as GlobalWithTelemetry
  global[CLI_TELEMETRY_SYMBOL] = telemetry
}

/**
 * Clears the global CLI telemetry store.
 * @internal
 */
export function clearCliTelemetry(): void {
  const global = globalThis as GlobalWithTelemetry
  delete global[CLI_TELEMETRY_SYMBOL]
}

import {CLIError} from '@oclif/core/errors'

import {type CLITelemetryStore} from '../telemetry/types.js'
import {isTrueish} from './isTrueish.js'

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
  // This should never happen, but just in case.
  // Ignore this error in tests to avoid failing tests as tests don't run to
  if (!global[CLI_TELEMETRY_SYMBOL] && !isTrueish(process.env.TEST)) {
    throw new CLIError('CLI telemetry not initialized', {exit: 1})
  }

  return global[CLI_TELEMETRY_SYMBOL] as CLITelemetryStore
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

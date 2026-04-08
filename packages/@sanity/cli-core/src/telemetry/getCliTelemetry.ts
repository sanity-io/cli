import {ux} from '@oclif/core'
import {type TelemetryTrace} from '@sanity/telemetry'

import {type CLITelemetryStore, type TelemetryUserProperties} from './types.js'

// Inline noop implementation — avoids a runtime dependency on @sanity/telemetry
// (types-only usage keeps it as a devDependency). Explicit types ensure this
// stays structurally in sync with TelemetryLogger/TelemetryTrace.
const noopTrace: TelemetryTrace<TelemetryUserProperties, never> = {
  await: <P extends Promise<unknown>>(promise: P): P => promise,
  complete: () => {},
  error: () => {},
  log: () => {},
  newContext: (): CLITelemetryStore => noopLogger,
  start: () => {},
}

/**
 * Fallback logger used when telemetry has not been initialized.
 * Exported for use in tests only — do not use in plugins or external code.
 * @internal
 */
export const noopLogger: CLITelemetryStore = {
  log: () => {},
  resume: () => {},
  trace: () => noopTrace,
  updateUserProperties: () => {},
}

/**
 * @public
 * Symbol used to store CLI telemetry state on globalThis.
 * Use the accessor functions instead of accessing this directly.
 */
export const CLI_TELEMETRY_SYMBOL = Symbol.for('sanity.cli.telemetry')

type TraceErrorReporter = (error: Error) => void

interface CliTelemetryState {
  logger: CLITelemetryStore

  reportTraceError?: TraceErrorReporter
}

type GlobalWithTelemetry = typeof globalThis & {
  [CLI_TELEMETRY_SYMBOL]?: CliTelemetryState
}

function getState(): CliTelemetryState | undefined {
  return (globalThis as GlobalWithTelemetry)[CLI_TELEMETRY_SYMBOL]
}

/**
 * @public
 */
export function getCliTelemetry(): CLITelemetryStore {
  const state = getState()
  // This should never happen, but if it does, we return a noop logger to avoid errors.
  if (!state) {
    ux.warn('CLI telemetry not initialized, returning noop logger')
    return noopLogger
  }

  return state.logger
}

/**
 * Sets the global CLI telemetry state.
 * @internal
 */
export function setCliTelemetry(
  telemetry: CLITelemetryStore,
  options?: {reportTraceError?: TraceErrorReporter},
): void {
  ;(globalThis as GlobalWithTelemetry)[CLI_TELEMETRY_SYMBOL] = {
    logger: telemetry,
    reportTraceError: options?.reportTraceError,
  }
}

/**
 * Reports an error to the CLI command trace. Called from SanityCommand.catch()
 * for real command errors (not user aborts).
 * @internal
 */
export function reportCliTraceError(error: Error): void {
  getState()?.reportTraceError?.(error)
}

/**
 * Clears the global CLI telemetry store.
 * @internal
 */
export function clearCliTelemetry(): void {
  const global = globalThis as GlobalWithTelemetry
  delete global[CLI_TELEMETRY_SYMBOL]
}

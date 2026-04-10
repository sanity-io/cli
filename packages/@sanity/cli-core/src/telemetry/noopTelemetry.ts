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

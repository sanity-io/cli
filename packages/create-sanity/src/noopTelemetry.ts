import {type CLITelemetryStore} from '@sanity/cli-core'

/**
 * No-op telemetry logger for standalone create-sanity.
 * Real telemetry will be wired up in a follow-up.
 *
 * @internal
 */
export function createNoopTelemetryStore(): CLITelemetryStore {
  const store: CLITelemetryStore = {
    log() {},
    trace() {
      return {
        await: <T>(promise: Promise<T>) => promise,
        complete() {},
        error() {},
        log() {},
        newContext() {
          return store
        },
        start() {},
      }
    },
    updateUserProperties() {},
  }
  return store
}

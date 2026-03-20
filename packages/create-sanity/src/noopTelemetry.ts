import {type CLITelemetryStore} from '@sanity/cli-core'

/**
 * No-op telemetry logger for standalone create-sanity.
 * Real telemetry will be wired up in a follow-up.
 */
export function createNoopTelemetryStore(): CLITelemetryStore {
  const store: CLITelemetryStore = {
    updateUserProperties() {},
    log() {},
    trace() {
      return {
        start() {},
        log() {},
        complete() {},
        error() {},
        newContext() {
          return store
        },
        await: (promise) => promise,
      }
    },
  }
  return store
}

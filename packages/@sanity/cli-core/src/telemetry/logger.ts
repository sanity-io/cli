import {
  type DefinedTelemetryLog,
  type DefinedTelemetryTrace,
  type TelemetryEvent,
  type TelemetryLogger,
  type TelemetryTrace,
} from '@sanity/telemetry'

import {telemetryStoreDebug} from './telemetryStoreDebug.js'
import {createTrace} from './trace.js'

// Sample rate tracking for log events
const logSampleTracker = new Map<string, number>()

/**
 * Creates a telemetry logger that emits events via the provided emit function
 * @internal
 */
export function createLogger<UserProperties>(
  sessionId: string,
  emit: (event: TelemetryEvent) => void,
): TelemetryLogger<UserProperties> {
  telemetryStoreDebug('Creating logger for session: %s', sessionId)

  const log = <Data>(event: DefinedTelemetryLog<Data>, data?: Data) => {
    telemetryStoreDebug('Logging event: %s', event.name)

    // Handle sampling if maxSampleRate is specified
    if (event.maxSampleRate && event.maxSampleRate > 0) {
      const now = Date.now()
      const lastEmit = logSampleTracker.get(event.name) || 0

      if (now - lastEmit < event.maxSampleRate) {
        telemetryStoreDebug(
          'Skipping event %s due to sampling (maxSampleRate: %d)',
          event.name,
          event.maxSampleRate,
        )
        return // Skip due to sampling
      }

      logSampleTracker.set(event.name, now)
      telemetryStoreDebug('Event %s passed sampling check', event.name)
    }

    const logEvent: TelemetryEvent = {
      createdAt: new Date().toISOString(),
      data: data ?? null,
      name: event.name,
      sessionId,
      type: 'log',
      version: event.version,
    }

    emit(logEvent)
  }

  const trace = <Data, Context = unknown>(
    event: DefinedTelemetryTrace<Data, Context>,
    context?: Context,
  ): TelemetryTrace<UserProperties, Data> => {
    telemetryStoreDebug('Creating trace: %s', event.name)
    return createTrace(event, context, sessionId, emit, createLogger)
  }

  const updateUserProperties = (properties: UserProperties) => {
    telemetryStoreDebug('Updating user properties: %o', properties)
    const userPropsEvent: TelemetryEvent = {
      createdAt: new Date().toISOString(),
      properties,
      sessionId,
      type: 'userProperties',
    }

    emit(userPropsEvent)
  }

  return {
    log,
    trace,
    updateUserProperties,
  }
}

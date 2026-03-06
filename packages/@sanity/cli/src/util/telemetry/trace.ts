import {
  type DefinedTelemetryTrace,
  type TelemetryEvent,
  type TelemetryLogger,
  type TelemetryTrace,
} from '@sanity/telemetry'

import {createTraceId} from './createTraceId.js'
import {telemetryStoreDebug} from './telemetryStoreDebug.js'

/**
 * Creates a trace instance that can emit trace lifecycle events
 * @internal
 */
export function createTrace<Data, Context = unknown, UserProperties = unknown>(
  definition: DefinedTelemetryTrace<Data, Context>,
  context: Context | undefined,
  sessionId: string,
  emit: (event: TelemetryEvent) => void,
  createLoggerFn: <UserProperties>(
    sessionId: string,
    emit: (event: TelemetryEvent) => void,
  ) => TelemetryLogger<UserProperties>,
): TelemetryTrace<UserProperties, Data> {
  const traceId = createTraceId()
  telemetryStoreDebug('Creating trace %s with traceId: %s', definition.name, traceId)

  let isStarted = false
  let isCompleted = false

  const emitTraceEvent = (type: string, data?: Data | Error) => {
    if (isCompleted) return

    const baseEvent = {
      context: context as Context,
      createdAt: new Date().toISOString(),
      name: definition.name,
      sessionId,
      traceId,
      version: definition.version,
    }

    let traceEvent: TelemetryEvent

    switch (type) {
      case 'trace.complete': {
        traceEvent = {
          ...baseEvent,
          type: 'trace.complete',
          ...(data && {data}),
        } as TelemetryEvent

        break
      }
      case 'trace.error': {
        traceEvent = {
          ...baseEvent,
          data,
          type: 'trace.error',
        } as TelemetryEvent

        break
      }
      case 'trace.log': {
        traceEvent = {
          ...baseEvent,
          data,
          type: 'trace.log',
        } as TelemetryEvent

        break
      }
      case 'trace.start': {
        traceEvent = {
          ...baseEvent,
          type: 'trace.start',
        } as TelemetryEvent

        break
      }
      default: {
        return // Unknown type
      }
    }

    emit(traceEvent)
  }

  const start = () => {
    if (isStarted) {
      telemetryStoreDebug('Trace %s already started', traceId)
      return
    }
    telemetryStoreDebug('Starting trace %s', traceId)
    isStarted = true
    emitTraceEvent('trace.start')
  }

  const log = (data: Data) => {
    telemetryStoreDebug('Logging data for trace %s', traceId)
    if (!isStarted) start()
    emitTraceEvent('trace.log', data)
  }

  const complete = () => {
    if (isCompleted) {
      telemetryStoreDebug('Trace %s already completed', traceId)
      return
    }
    telemetryStoreDebug('Completing trace %s', traceId)
    if (!isStarted) start()
    emitTraceEvent('trace.complete')
    isCompleted = true
  }

  const error = (err: Error) => {
    if (isCompleted) {
      telemetryStoreDebug('Trace %s already completed, ignoring error', traceId)
      return
    }
    telemetryStoreDebug('Error in trace %s: %s', traceId, err.message)
    if (!isStarted) start()
    // Convert Error to serializable object
    const errorData = {
      message: err.message,
      name: err.name,
      stack: err.stack,
    }
    emitTraceEvent('trace.error', errorData)
    isCompleted = true
  }

  const awaitPromise = <P extends Promise<unknown>>(promise: P, finalData?: Data): P => {
    if (!isStarted) start()

    return promise
      .then((result) => {
        if (finalData !== undefined) {
          log(finalData)
        }
        complete()
        return result
      })
      .catch((err) => {
        error(err)
        throw err
      }) as P
  }

  const newContext = (name: string): TelemetryLogger<UserProperties> => {
    const contextEmit = (event: TelemetryEvent) => {
      // For trace events, we can add context, but for log events we need to be careful
      if (event.type.startsWith('trace.')) {
        const existingContext = (event as {context?: unknown}).context
        emit({
          ...event,
          context: {
            ...(typeof existingContext === 'object' && existingContext ? existingContext : {}),
            contextName: name,
          },
        } as TelemetryEvent)
      } else {
        // For log events, we can't add context as it's not part of TelemetryLogEvent
        // Just emit as-is
        emit(event)
      }
    }

    return createLoggerFn<UserProperties>(sessionId, contextEmit)
  }

  return {
    await: awaitPromise,
    complete,
    error,
    log,
    newContext,
    start,
  }
}

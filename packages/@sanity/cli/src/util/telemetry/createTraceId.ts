import {randomUUID} from 'node:crypto'

type TraceId = string & {__type: 'TraceId'}

/**
 * Creates a unique ID for correlating telemetry events within a trace.
 *
 * @internal
 */
export function createTraceId(): TraceId {
  return `trace_${randomUUID()}` as TraceId
}

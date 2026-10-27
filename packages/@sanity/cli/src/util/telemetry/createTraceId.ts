import {v7 as uuidv7} from 'uuid'

type TraceId = string & {__type: 'TraceId'}

/**
 * Creates a unique, time-sortable trace ID using UUIDv7
 *
 * @internal
 */
export function createTraceId(): TraceId {
  return `trace_${uuidv7()}` as TraceId
}

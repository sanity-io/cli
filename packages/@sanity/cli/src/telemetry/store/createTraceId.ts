import {typeid} from 'typeid-js'

type TraceId = string & {__type: 'TraceId'}

/**
 * Creates a unique trace ID using typeid
 *
 * @internal
 */
export function createTraceId(): TraceId {
  return typeid('trace').toString() as TraceId
}

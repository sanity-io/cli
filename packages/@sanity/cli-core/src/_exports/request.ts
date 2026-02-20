export {createRequester, type MiddlewareOptions} from '../request/createRequester.js'

// Re-export get-it types used by consumers of createRequester
export {type Requester} from 'get-it'

// Re-export non-default middleware from get-it for use alongside createRequester.
// Default middleware (httpErrors, headers, debug, promise) are applied automatically
// by createRequester and don't need to be imported separately.
export {
  agent,
  base,
  Cancel,
  CancelToken,
  injectResponse,
  jsonRequest,
  jsonResponse,
  keepAlive,
  mtls,
  observable,
  progress,
  proxy,
  retry,
  urlEncoded,
} from 'get-it/middleware'

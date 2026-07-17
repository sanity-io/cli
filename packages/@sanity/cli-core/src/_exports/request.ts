export {createRequester, type CreateRequesterOptions} from '../request/createRequester.js'
export {nodeReadableFromWeb} from '../request/nodeReadableFromWeb.js'

// Re-export get-it types and helpers used by consumers of createRequester
export {
  type BufferedResponse,
  type FetchFunction,
  HttpError,
  type JsonResponse,
  type RequestFunction,
  type RequestOptions,
  type StreamResponse,
  type TextResponse,
  type TransformMiddleware,
  type WrappingMiddleware,
} from 'get-it'

// Re-export middleware still available in get-it v9
export {debug, retry} from 'get-it/middleware'

// Re-export the Node fetch factory for consumers that need transport wrappers.
export {createNodeFetch, type NodeFetchOptions, type TlsOptions} from 'get-it/node'

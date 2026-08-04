import {createRequire} from 'node:module'

import {ClientError, isHttpError, ServerError} from '@sanity/client'
import {getIt, type HttpContext, type Middleware, type Requester, type RequestOptions} from 'get-it'
import {
  agent,
  headers,
  jsonRequest,
  jsonResponse,
  observable,
  progress,
  retry,
} from 'get-it/middleware'
import {Observable} from 'rxjs'

const requireFromHere = createRequire(import.meta.url)
const clientPackage: unknown = requireFromHere('@sanity/client/package.json')
const clientVersion =
  typeof clientPackage === 'object' &&
  clientPackage !== null &&
  'version' in clientPackage &&
  typeof clientPackage.version === 'string'
    ? clientPackage.version
    : 'unknown'

/**
 * Create the requester used by Sanity clients inside a CLI execution context.
 *
 * This mirrors the Node requester from `@sanity/client`, except that it has no
 * debug or lineage middleware. The client requester's defaults cannot be
 * safely reused here because they read `DEBUG` and `X_SANITY_LINEAGE` from the
 * embedding process.
 */
export function createIsolatedRequester(): Requester {
  return getIt([
    retry({shouldRetry}),
    headers({'User-Agent': `@sanity/client ${clientVersion}`}),
    removeLineage(),
    agent({keepAlive: true, maxSockets: 30, maxTotalSockets: 256}),
    jsonRequest(),
    jsonResponse(),
    progress(),
    httpErrors,
    observable({implementation: Observable}),
  ])
}

function removeLineage(): Middleware {
  return {
    processOptions(options: RequestOptions) {
      const requestHeaders = {...options.headers}
      for (const name of Object.keys(requestHeaders)) {
        if (name.toLowerCase() === 'x-sanity-lineage') delete requestHeaders[name]
      }
      return {...options, headers: requestHeaders}
    },
  }
}

const httpErrors: Middleware = {
  onResponse(response, context: HttpContext) {
    if (response.statusCode >= 500) throw new ServerError(response)
    if (response.statusCode >= 400) throw new ClientError(response, context)
    return response
  },
}

function shouldRetry(error: unknown, attempt: number, options: RequestOptions): boolean {
  if (options.maxRetries === 0) return false

  const isSafe = options.method === 'GET' || options.method === 'HEAD'
  const uri = 'uri' in options && typeof options.uri === 'string' ? options.uri : options.url
  const isQuery = uri.startsWith('/data/query')
  const isRetriableResponse =
    isHttpError(error) && [429, 502, 503].includes(error.response.statusCode)

  return (isSafe || isQuery) && isRetriableResponse
    ? true
    : retry.shouldRetry(error, attempt, options)
}

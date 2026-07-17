import {getCliToken, getGlobalCliClient, getProjectCliClient} from '@sanity/cli-core'
import {createRequester} from '@sanity/cli-core/request'

import {type ResolvedEndpoint} from '../actions/api/resolveEndpoint.js'

const API_REQUEST_TAG = 'sanity.cli.api'

/**
 * Options for {@link performApiRequest}.
 */
export interface PerformApiRequestOptions {
  /** HTTP method (upper case). */
  method: string

  /** The resolved request target. */
  resolved: ResolvedEndpoint

  /** Request body: objects are JSON-serialized, strings are sent verbatim. */
  body?: string | unknown

  /** Extra request headers. A user-provided `Authorization` header wins over the CLI token. */
  headers?: Record<string, string>

  /** Extra query parameters, merged with those from the endpoint argument. */
  query?: Record<string, string | string[]>

  /** Send the request without an authorization token. */
  unauthenticated?: boolean
}

/**
 * The full HTTP response of an API request. Non-2xx responses are returned,
 * not thrown - the command decides how to surface them.
 */
export interface ApiResponse {
  /** Parsed JSON body for JSON responses, raw text otherwise. */
  body: unknown

  headers: Record<string, string>

  /** The raw response body text. */
  rawBody: string

  statusCode: number

  url: string

  statusMessage?: string
}

/**
 * Perform an authenticated raw HTTP request against a Sanity API.
 *
 * URL construction and token resolution reuse the standard CLI client
 * factories; the request itself uses a bare requester so the response
 * (status, headers, non-JSON bodies) can be passed through unfiltered.
 */
export async function performApiRequest(options: PerformApiRequestOptions): Promise<ApiResponse> {
  const {body, headers = {}, method, query = {}, resolved, unauthenticated = false} = options

  const {token, url} = await resolveRequestTarget(resolved, unauthenticated)

  const requestHeaders: Record<string, string> = {}
  if (token) requestHeaders.Authorization = `Bearer ${token}`

  let requestBody: string | undefined
  if (typeof body === 'string') {
    requestBody = body
  } else if (body !== undefined) {
    requestBody = JSON.stringify(body)
  }
  if (requestBody !== undefined) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  for (const [key, value] of Object.entries(headers)) {
    requestHeaders[key] = value
  }

  const request = createRequester({
    middleware: {httpErrors: false, promise: {onlyBody: false}},
  })

  const mergedQuery = {...resolved.query, ...query}

  const response = await request({
    ...(requestBody === undefined ? {} : {body: requestBody}),
    headers: requestHeaders,
    method,
    query: {tag: API_REQUEST_TAG, ...mergedQuery},
    url,
  })

  const rawBody = typeof response.body === 'string' ? response.body : String(response.body ?? '')

  return {
    body: parseBody(rawBody, response.headers['content-type']),
    headers: response.headers,
    rawBody,
    statusCode: response.statusCode,
    statusMessage: response.statusMessage,
    url: response.url,
  }
}

async function resolveRequestTarget(
  resolved: ResolvedEndpoint,
  unauthenticated: boolean,
): Promise<{token?: string; url: string}> {
  if (resolved.kind === 'url') {
    const token = unauthenticated ? undefined : await getCliToken()
    if (!token && !unauthenticated) {
      throw new Error('You must login first - run "sanity login"')
    }
    return {token, url: resolved.url}
  }

  // The client factories handle token resolution, staging/production API
  // hosts and the project subdomain - we only use them to build the URL.
  const client =
    resolved.host === 'project'
      ? await getProjectCliClient({
          apiVersion: resolved.apiVersion,
          projectId: resolved.projectId as string,
          requireUser: !unauthenticated,
        })
      : await getGlobalCliClient({
          apiVersion: resolved.apiVersion,
          requireUser: !unauthenticated,
          unauthenticated,
        })

  const token = unauthenticated ? undefined : (client.config().token ?? undefined)

  return {token, url: client.getUrl(resolved.path)}
}

function parseBody(rawBody: string, contentType: string | undefined): unknown {
  if (rawBody === '' || !contentType || !/\bjson\b/.test(contentType)) {
    return rawBody
  }
  try {
    return JSON.parse(rawBody)
  } catch {
    return rawBody
  }
}

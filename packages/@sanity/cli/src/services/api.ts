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

  /** Request body: objects are JSON-serialized; strings and raw byte buffers are sent verbatim. */
  body?: Buffer | string | unknown

  /** Extra request headers. A user-provided `Authorization` header wins over the CLI token. */
  headers?: Record<string, string>

  /** Extra query parameters, merged with those from the endpoint argument. */
  query?: Record<string, string | string[]>

  /** Explicit API token, used instead of the logged-in user's token. */
  token?: string

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

  /** Whether `body` was parsed from a JSON response. */
  jsonBody: boolean

  /** The raw response body text. */
  rawBody: string

  statusCode: number

  /**
   * The final response URL, including merged query parameters and redirects.
   */
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
  const {
    body,
    headers = {},
    method,
    query = {},
    resolved,
    token: providedToken,
    unauthenticated = false,
  } = options

  const {token, url} = await resolveRequestTarget(resolved, unauthenticated, providedToken)

  // Header names are case-insensitive - keyed lowercase so a user-provided
  // header (eg `-H 'authorization: ...'`) replaces the default regardless of
  // how either side is cased.
  const requestHeaders: Record<string, string> = {}
  if (token) requestHeaders.authorization = `Bearer ${token}`

  let requestBody: Buffer | string | undefined
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    // Raw bodies (--input) pass through without a default Content-Type - the
    // caller knows the media type, we don't (gh api behaves the same way)
    requestBody = body
  } else if (body !== undefined) {
    requestBody = JSON.stringify(body)
    requestHeaders['content-type'] = 'application/json'
  }

  for (const [key, value] of Object.entries(headers)) {
    requestHeaders[key.toLowerCase()] = value
  }

  const request = createRequester({
    httpErrors: false,
    // Raw API passthrough: request duration is caller-controlled (eg long
    // exports), so no default deadline is imposed.
    timeout: false,
  })

  const mergedQuery = {...resolved.query, ...query}

  // Built as URLSearchParams so repeated field values (eg `-f tag=a -f tag=b`)
  // become repeated query parameters.
  const searchParams = new URLSearchParams({tag: API_REQUEST_TAG})
  for (const [key, value] of Object.entries(mergedQuery)) {
    if (Array.isArray(value)) {
      for (const item of value) searchParams.append(key, item)
    } else {
      searchParams.set(key, value)
    }
  }

  const response = await request({
    ...(requestBody === undefined ? {} : {body: requestBody}),
    as: 'text',
    headers: requestHeaders,
    method,
    query: searchParams,
    url,
  })

  const rawBody = response.body
  const parsed = parseBody(rawBody, response.headers.get('content-type') ?? undefined)

  return {
    body: parsed.body,
    headers: Object.fromEntries(response.headers.entries()),
    jsonBody: parsed.jsonBody,
    rawBody,
    statusCode: response.status,
    statusMessage: response.statusText,
    url: response.url,
  }
}

async function resolveRequestTarget(
  resolved: ResolvedEndpoint,
  unauthenticated: boolean,
  providedToken?: string,
): Promise<{token?: string; url: string}> {
  if (resolved.kind === 'url') {
    const token = unauthenticated ? undefined : providedToken || (await getCliToken())
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
          token: providedToken,
        })
      : await getGlobalCliClient({
          apiVersion: resolved.apiVersion,
          requireUser: !unauthenticated,
          token: providedToken,
          unauthenticated,
        })

  const token = unauthenticated ? undefined : (client.config().token ?? undefined)

  return {token, url: client.getUrl(resolved.path)}
}

function parseBody(
  rawBody: string,
  contentType: string | undefined,
): {body: unknown; jsonBody: boolean} {
  if (rawBody === '' || !contentType || !/\bjson\b/.test(contentType)) {
    return {body: rawBody, jsonBody: false}
  }
  try {
    return {body: JSON.parse(rawBody), jsonBody: true}
  } catch {
    return {body: rawBody, jsonBody: false}
  }
}

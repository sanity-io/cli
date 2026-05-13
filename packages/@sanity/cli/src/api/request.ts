/**
 * Outbound HTTP for `sanity api <endpoint>`.
 *
 * Two named seams:
 *
 *   - `buildRequestUrl` assembles the final URL — fills host + path
 *     placeholders from caller context, strips the api-version
 *     overlap between the server template and the operation path,
 *     and merges inline + flag query params with the CLI's
 *     telemetry tag. Single point where every URL-shape decision
 *     lives.
 *   - `sendApiRequest` runs the actual fetch — bearer-token auth,
 *     timeout, status/contentType/body triple for the renderer.
 *
 * Knows nothing about endpoint matching, preflight validation, or
 * how the user invoked the CLI.
 */

import {type OperationIndexEntry} from './parser.js'
import {fillPlaceholders} from './resolveEndpoint.js'

const FETCH_TIMEOUT_MS = 60_000

/** Coarse telemetry tag merged into every outbound URL (unless the user set their own). */
const REQUEST_TAG_KEY = 'tag'
const REQUEST_TAG_VALUE = 'sanity.cli.api'

interface ApiRequest {
  /** Request body bytes/string. `null` means no body. */
  body: string | null
  /** `Content-Type` for the body. Honored only when `body` is non-null. */
  contentType: string | null
  /**
   * Additional headers from `-H`. Lower-cased keys. Values here win
   * over the CLI's defaults (Authorization, Content-Type) — escape
   * hatch for users overriding auth or content-type explicitly.
   */
  extraHeaders: Record<string, string>
  /** Uppercase HTTP method. */
  method: string
  /** Bearer token. `null` means send unauthenticated. */
  token: string | null
  /** Fully-resolved URL — host + path + final query string, no placeholders. */
  url: string
}

interface ApiResponse {
  body: string
  contentType: string
  status: number
}

/* ---------------------------------------------------------------------- *
 *  URL assembly                                                           *
 * ---------------------------------------------------------------------- */

interface BuildRequestUrlInputs {
  /**
   * `--project` / `--dataset` values + env-var fallbacks. Used to
   * substitute `:projectId` / `:dataset` placeholders in the host
   * + path.
   */
  context: Record<string, string>
  /** Inline query string from the user's endpoint argument (no leading `?`). */
  inlineQuery: string
  /** The matched operation entry — provides `serverTemplate` and the path template. */
  operation: OperationIndexEntry
  /** The user's path (after `{name}` → `:name` normalization), pre-substitution. */
  path: string
  /** Repeatable `-q key=value` flag values. */
  queryFlags: readonly string[]
}

/**
 * Build the final outbound URL.
 *
 * Composition order (subtle; the api-version overlap-stripping is the
 * easy-to-get-wrong part):
 *
 *   1. Fill `:name` placeholders in host + path from `context`.
 *   2. Strip the api-version segment from the path if the host already
 *      includes it. Real-world specs put the api-version in EITHER
 *      `servers[0].url` (e.g. `https://api.sanity.io/v2021-06-07`) or
 *      as the leading segment of every operation path (e.g.
 *      `/v2026-04-27/organizations/{org}/…`). The path template emitted
 *      by `parser.ts` always carries the version, so when the host has
 *      it too we'd double up without the strip.
 *   3. Merge query params: inline first (lower precedence), `-q` flags
 *      next (override on key conflict, preserve repetition for array
 *      semantics), telemetry tag last (unless the user set one).
 */
export function buildRequestUrl(inputs: BuildRequestUrlInputs): string {
  const {context, inlineQuery, operation, path, queryFlags} = inputs

  const resolvedHost = fillPlaceholders(operation.serverTemplate, context)
  const resolvedPath = fillPlaceholders(path, context)

  const hostPath = new URL(resolvedHost).pathname.replaceAll(/^\/+|\/+$/g, '')
  const cleanPath = resolvedPath.replace(/^\/+/, '')
  const relative =
    hostPath && cleanPath.startsWith(`${hostPath}/`)
      ? cleanPath.slice(hostPath.length + 1)
      : cleanPath

  const base = resolvedHost.replace(/\/$/, '')
  const url = `${base}/${relative}`
  const queryString = buildQueryString(inlineQuery, queryFlags)
  return queryString ? `${url}?${queryString}` : url
}

function buildQueryString(inline: string, flagPairs: readonly string[]): string {
  const params = new URLSearchParams()

  // Inline first (lower precedence on conflict).
  if (inline) {
    for (const [key, value] of new URLSearchParams(inline)) {
      params.append(key, value)
    }
  }

  // Flag values override on conflict — drop inline values for the same key.
  // Pairs without `=` are rejected upstream in the command layer, so the
  // defensive guard below is unreachable at runtime. Keep it as a belt-
  // and-suspenders safety net for callers that bypass the CLI surface.
  const flagKeys = new Set<string>()
  for (const pair of flagPairs) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    const key = pair.slice(0, eq)
    if (!flagKeys.has(key)) {
      params.delete(key)
      flagKeys.add(key)
    }
    params.append(key, pair.slice(eq + 1))
  }

  // Add the telemetry tag unless the user already set one.
  if (!params.has(REQUEST_TAG_KEY)) {
    params.append(REQUEST_TAG_KEY, REQUEST_TAG_VALUE)
  }

  return params.toString()
}

/* ---------------------------------------------------------------------- *
 *  Send                                                                   *
 * ---------------------------------------------------------------------- */

/**
 * Send an API request. Throws on network errors / timeouts so callers
 * can surface a friendly "service unreachable" message. Non-2xx
 * statuses come back as a regular `ApiResponse` — callers decide
 * whether to error.
 */
export async function sendApiRequest(request: ApiRequest): Promise<ApiResponse> {
  const response = await fetch(request.url, {
    body: request.body ?? undefined,
    headers: buildOutboundHeaders(request),
    method: request.method,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  return {
    body: await response.text(),
    contentType: response.headers.get('content-type') ?? '',
    status: response.status,
  }
}

/**
 * Stream a response body to a `chunk → void` sink. The sink runs for
 * every decoded text chunk as it arrives — the caller buffers nothing.
 *
 * Returns `{status, contentType}` only; the body lives in the chunks
 * the sink consumed. Non-2xx is still surfaced so the caller can
 * decide whether the stream output is the error itself or a payload.
 *
 * Timeout note: the AbortSignal applies to the *fetch* and to the
 * entire response read, not to the time between chunks. SSE endpoints
 * can stay idle for minutes between events; if that matters we'd
 * need a per-chunk timeout, but the current 60s budget covers the
 * Sanity endpoints we route to.
 */
export async function streamApiResponse(
  request: ApiRequest,
  sink: (chunk: string) => void,
): Promise<{contentType: string; status: number}> {
  const response = await fetch(request.url, {
    body: request.body ?? undefined,
    headers: buildOutboundHeaders(request),
    method: request.method,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (response.body) {
    const decoder = new TextDecoder()
    const reader = response.body.getReader()
    try {
      for (;;) {
        const {done, value} = await reader.read()
        if (done) break
        sink(decoder.decode(value, {stream: true}))
      }
      const flush = decoder.decode()
      if (flush) sink(flush)
    } finally {
      reader.releaseLock()
    }
  }

  return {
    contentType: response.headers.get('content-type') ?? '',
    status: response.status,
  }
}

/**
 * Compose outbound headers. CLI defaults (Authorization, Content-Type)
 * go in first; `-H` values overwrite — explicit user intent wins. All
 * keys are lower-cased so case-only collisions can't end up sending
 * both `Authorization` and `authorization`; HTTP header names are
 * case-insensitive on the wire.
 */
function buildOutboundHeaders(request: ApiRequest): Record<string, string> {
  const headers: Record<string, string> = {}
  if (request.token) headers.authorization = `Bearer ${request.token}`
  if (request.body !== null && request.contentType) {
    headers['content-type'] = request.contentType
  }
  for (const [name, value] of Object.entries(request.extraHeaders)) {
    headers[name] = value
  }
  return headers
}

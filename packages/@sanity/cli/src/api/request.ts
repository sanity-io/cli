/**
 * Outbound HTTP for `sanity api <endpoint>`.
 *
 * Single seam responsible for: bearer-token auth, the `tag` query
 * param the Sanity backend logs for MCP-fallback telemetry, request
 * timeout, and turning the raw response into a status/contentType/body
 * triple for the command layer to render.
 *
 * Knows nothing about endpoint matching, placeholder resolution, or
 * how the user invoked the CLI.
 */

const FETCH_TIMEOUT_MS = 60_000

/** Coarse telemetry tag merged into every outbound URL (unless the user set their own). */
const REQUEST_TAG_KEY = 'tag'
const REQUEST_TAG_VALUE = 'sanity.cli.api'

interface ApiRequest {
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

/**
 * Send an API request. Throws on network errors / timeouts so callers
 * can surface a friendly "service unreachable" message. Non-2xx
 * statuses come back as a regular `ApiResponse` — callers decide
 * whether to error.
 */
export async function sendApiRequest(request: ApiRequest): Promise<ApiResponse> {
  const headers: Record<string, string> = {}
  if (request.token) headers.Authorization = `Bearer ${request.token}`

  const response = await fetch(request.url, {
    headers,
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
 * Build the final outbound query string by merging inline-query +
 * `-q` flags, then add the CLI's telemetry tag. `-q` wins on key
 * conflict with inline. A user-supplied `tag=…` (either form) is
 * respected — we don't override it.
 *
 * Repeated keys are preserved (server-side array semantics):
 * `-q tag=a -q tag=b` → `tag=a&tag=b`.
 */
export function buildQueryString(inline: string, flagPairs: readonly string[]): string {
  const params = new URLSearchParams()

  // Inline first (lower precedence on conflict).
  if (inline) {
    for (const [key, value] of new URLSearchParams(inline)) {
      params.append(key, value)
    }
  }

  // Flag values override on conflict — drop inline values for the same key.
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

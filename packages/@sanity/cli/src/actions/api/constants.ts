/**
 * Fallback API version used when neither the endpoint path, the `--api-version`
 * flag, nor the matched OpenAPI spec provides one.
 */
export const API_DEFAULT_VERSION = 'v2025-02-19'

/**
 * Base URL for the published OpenAPI specification index.
 * Also used by the `sanity openapi` commands.
 */
export const OPENAPI_SPEC_INDEX_URL = 'https://www.sanity.io/docs/api/openapi'

/**
 * Matches an API version path segment: `v1`, `vX` or `v<YYYY-MM-DD>`.
 */
export const API_VERSION_SEGMENT_RE = /^v(?:\d{4}-\d{2}-\d{2}|X|\d+)$/

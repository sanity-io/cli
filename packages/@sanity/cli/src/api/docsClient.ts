/**
 * The HTTP layer talking to `sanity.io/docs/api/openapi`.
 *
 * - `fetchSpecIndex` → the index endpoint (one entry per public spec)
 * - `fetchSpec`      → one spec's body by slug
 *
 * Both share base-URL resolution (`SANITY_DOCS_API_URL`) and Vercel SSO
 * bypass-token handling (`SANITY_DOCS_API_BYPASS_TOKEN`), so they live
 * in one module.
 */

const DEFAULT_DOCS_API_URL = 'https://www.sanity.io/docs'
const FETCH_TIMEOUT_MS = 10_000

/**
 * One entry from the docs index endpoint (`/api/openapi`).
 *
 * `revision` is the Sanity document `_rev`, projected onto the public
 * response. The CLI uses it as the cache invalidation key.
 *
 * `revision` may be the empty string if the upstream endpoint hasn't
 * deployed the contract extension yet — in that case the revalidation
 * loop conservatively refetches on every invocation (see revalidate.ts).
 */
export interface OpenApiSpecIndexEntry {
  description: string
  revision: string
  slug: string
  title: string
}

interface FetchSpecResult {
  /** Raw response body (YAML text). */
  content: string
  contentType: string
}

/**
 * Resolve the docs API base URL.
 *
 * Defaults to production. The dev loop points at a Vercel preview via
 * `SANITY_DOCS_API_URL` until the docs-team PR adding the `revision`
 * field merges (see spec, section 5.1).
 */
function getDocsApiBaseUrl(): string {
  return process.env.SANITY_DOCS_API_URL || DEFAULT_DOCS_API_URL
}

function buildHeaders(): HeadersInit {
  const token = process.env.SANITY_DOCS_API_BYPASS_TOKEN
  return token ? {'x-vercel-protection-bypass': token} : {}
}

/**
 * Fetch the docs index — one entry per parent spec, including
 * `revision` for revision-keyed cache invalidation.
 */
export async function fetchSpecIndex(): Promise<OpenApiSpecIndexEntry[]> {
  const url = `${getDocsApiBaseUrl()}/api/openapi`
  const response = await fetch(url, {
    headers: buildHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(
      `Docs OpenAPI index endpoint returned ${response.status} ${response.statusText} (${url})`,
    )
  }

  const body = (await response.json()) as {specs?: unknown}
  const rawSpecs = Array.isArray(body?.specs) ? body.specs : []

  return rawSpecs.map((raw): OpenApiSpecIndexEntry => {
    const spec = (raw ?? {}) as Record<string, unknown>
    return {
      description: typeof spec.description === 'string' ? spec.description : '',
      revision: typeof spec.revision === 'string' ? spec.revision : '',
      slug: typeof spec.slug === 'string' ? spec.slug : '',
      title: typeof spec.title === 'string' ? spec.title : '',
    }
  })
}

/**
 * Fetch a single OpenAPI spec by slug. Always requests YAML — the
 * canonical source-of-truth shape. Returns null on 404; throws on
 * other non-2xx statuses.
 */
export async function fetchSpec(slug: string): Promise<FetchSpecResult | null> {
  const url = new URL(`${getDocsApiBaseUrl()}/api/openapi/${encodeURIComponent(slug)}`)
  url.searchParams.set('format', 'yaml')

  const response = await fetch(url, {
    headers: buildHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(
      `Docs OpenAPI per-spec endpoint returned ${response.status} ${response.statusText} (${url})`,
    )
  }

  return {
    content: await response.text(),
    contentType: response.headers.get('content-type') || 'application/x-yaml',
  }
}

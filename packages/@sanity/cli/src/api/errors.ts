/**
 * Error-message construction + context-flag plumbing for the
 * `sanity api <endpoint>` command.
 *
 * The command-side seams (`preflight`, `resolveEndpoint`) deliberately
 * return issue *data* — no prose. This module owns the data → message
 * translation so each formatter has a real test surface, and so a
 * second consumer (agent SDK, JSON-output mode, telemetry) could reuse
 * the same wording without depending on oclif.
 *
 * Also owns:
 *   - {@link CONTEXT_PLACEHOLDERS}: the URL-placeholder → flag/env-var
 *     table. Adding `:something` becomes a one-row change.
 *   - {@link collectContextValues}: flag/env → values dict, feeding
 *     `endpointUrl.composeEndpointUrl`.
 *   - {@link suggestSimilarEndpoints}: typo-recovery for `sanity api`
 *     calls (api-version mismatches are the canonical case).
 */

import {composeEndpointUrl} from './endpointUrl.js'
import {type OperationIndexEntry} from './parser.js'
import {type PreflightIssue} from './preflight.js'

/* ---------------------------------------------------------------------- *
 *  Context placeholders                                                   *
 * ---------------------------------------------------------------------- */

/**
 * Placeholders the CLI fills from flags / env / `sanity.cli.ts`. Flag
 * names mirror the URL placeholder verbatim (e.g. `:projectId` →
 * `--projectId`) so users don't have to translate. Adding a new
 * supported placeholder is a single-row change.
 */
export const CONTEXT_PLACEHOLDERS = {
  dataset: {envVar: 'SANITY_DATASET', flag: 'dataset'},
  organizationId: {envVar: 'SANITY_ORGANIZATION_ID', flag: 'organizationId'},
  projectId: {envVar: 'SANITY_PROJECT_ID', flag: 'projectId'},
} as const

export type ContextPlaceholder = keyof typeof CONTEXT_PLACEHOLDERS

export function collectContextValues(flags: {
  dataset?: string
  organizationId?: string
  projectId?: string
}): Record<string, string> {
  const values: Record<string, string> = {}
  for (const name of Object.keys(CONTEXT_PLACEHOLDERS) as ContextPlaceholder[]) {
    const value = flags[name] ?? process.env[CONTEXT_PLACEHOLDERS[name].envVar]
    if (value) values[name] = value
  }
  return values
}

/* ---------------------------------------------------------------------- *
 *  Preflight error formatting                                             *
 * ---------------------------------------------------------------------- */

/**
 * Render a `PreflightIssue` as a user-facing error message. The switch
 * is exhaustive on `kind`; adding a new variant trips a `never`-type
 * error here instead of silently falling through.
 */
export function formatPreflightError(
  issue: PreflightIssue,
  operation: OperationIndexEntry,
  context: Record<string, string>,
  path: string,
): string {
  switch (issue.kind) {
    case 'missing-required-query': {
      return formatMissingRequiredQuery(issue.names, operation)
    }
    case 'unfilled-placeholder': {
      return formatUnfilledPlaceholders(issue.names, operation, context, path)
    }
    default: {
      const _exhaustive: never = issue
      throw new Error(`Unhandled preflight issue: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

function formatMissingRequiredQuery(names: string[], operation: OperationIndexEntry): string {
  // Endpoints with a `query` parameter (e.g. /data/query, /data/listen)
  // take it as a GROQ filter — the dedicated `--query` flag exists
  // specifically for that, so we surface it instead of the generic
  // `-q query=<value>` route when applicable.
  const hint = names.includes('query')
    ? `Hint: pass the GROQ filter with --query '<groq>' (e.g. --query '*[_type=="post"]'). For other params, use -q name=value.`
    : `Hint: pass with -q name=value.`
  return (
    `Missing required query parameter(s): ${names.join(', ')}\n` +
    `${hint}\nSee: sanity api spec ${operation.spec} ` +
    `--operation=${operation.operationId} --format=json`
  )
}

function formatUnfilledPlaceholders(
  names: string[],
  operation: OperationIndexEntry,
  context: Record<string, string>,
  path: string,
): string {
  const contextNames = names.filter(
    (name): name is ContextPlaceholder => name in CONTEXT_PLACEHOLDERS,
  )
  const nonContext = names.filter((name) => !(name in CONTEXT_PLACEHOLDERS))

  // Show the URL the call would resolve to. Same composition function
  // as the request layer — guarantees the user sees the same shape that
  // would have been sent. Subdomain placeholders (e.g. `:projectId` in
  // `https://:projectId.api.sanity.io/…`) are invisible from the
  // endpoint string the user typed, so listing names alone leaves them
  // wondering where the value would go — the preview makes it obvious.
  const resolvedUrl = composeEndpointUrl(operation, path, context)

  const lines = [
    `Endpoint requires value(s) for: ${names.map((n) => `:${n}`).join(', ')}`,
    `Resolved URL: ${resolvedUrl}`,
  ]
  if (contextNames.length > 0) {
    const {envVar, flag} = CONTEXT_PLACEHOLDERS[contextNames[0]]
    lines.push(
      `Hint: pass --${flag}=<value>, set ${envVar}, ` +
        'or run from a directory with `sanity.cli.ts`.',
    )
  }
  if (nonContext.length > 0) {
    lines.push(
      'Hint: substitute the value directly in the endpoint string ' +
        `(e.g. ${operation.endpoint.replaceAll(/:(\w+)/g, '<$1>')}).`,
    )
  }
  return lines.join('\n')
}

/* ---------------------------------------------------------------------- *
 *  Resolve-failure formatting                                             *
 * ---------------------------------------------------------------------- */

export function formatMethodNotAllowedError(
  userMethod: string,
  userPath: string,
  available: readonly string[],
): string {
  return (
    `Method ${userMethod} not allowed on "${userPath}". ` + `Available: ${available.join(', ')}.`
  )
}

export function formatNoMatchError(
  userPath: string,
  index: readonly OperationIndexEntry[],
): string {
  const suggestions = suggestSimilarEndpoints(userPath, index)
  const suggestionLine =
    suggestions.length > 0
      ? `\nDid you mean:\n  ${suggestions.map((s) => `- ${s}`).join('\n  ')}`
      : ''
  return (
    `No operation matches path "${userPath}".${suggestionLine}\n` +
    'Hint: run `sanity api list` to see valid endpoints.'
  )
}

export function formatMalformedQueryError(pair: string): string {
  return (
    `-q values must be in key=value form (got "${pair}").\n` +
    'Hint: pass empty values as `-q key=`.'
  )
}

/* ---------------------------------------------------------------------- *
 *  Suggestion engine                                                      *
 * ---------------------------------------------------------------------- */

/**
 * Suggest the closest endpoint(s) when the user's path doesn't match
 * any operation. Typos in the api-version segment (`v2024-01-01` vs
 * `v2025-02-19`) are the common case — agents pulling examples from a
 * stale source surface them often, and saving a round-trip there is
 * the highest-value fuzzy match this can do.
 *
 * Returns up to 3 candidate endpoint strings ordered by similarity.
 * The threshold is intentionally tight: only suggest when the distance
 * is small relative to the path length, so we don't flood the error
 * with unrelated near-misses.
 *
 * Exported (rather than file-local) so future tooling — REPLs, agent
 * SDKs, JSON-error envelopes — can reuse the same suggestion logic
 * without re-deriving it.
 */
export function suggestSimilarEndpoints(
  userPath: string,
  index: readonly OperationIndexEntry[],
): string[] {
  if (userPath.length === 0 || index.length === 0) return []
  // Normalize a candidate endpoint to its template shape so a user-typed
  // `v2024-01-01/data/query/production` can score against
  // `v2025-02-19/data/query/:dataset` without `production`/`:dataset`
  // contributing fake distance.
  const userTokens = tokenize(userPath)
  const seen = new Set<string>()
  const scored: {endpoint: string; score: number}[] = []
  for (const op of index) {
    if (seen.has(op.endpoint)) continue
    seen.add(op.endpoint)
    const score = tokenDistance(userTokens, tokenize(op.endpoint))
    scored.push({endpoint: op.endpoint, score})
  }
  scored.sort((a, b) => a.score - b.score)
  const lengthThreshold = Math.max(2, Math.floor(userPath.length / 6))
  return scored
    .filter((s) => s.score <= lengthThreshold)
    .slice(0, 3)
    .map((s) => s.endpoint)
}

function tokenize(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0)
}

/**
 * Edit-distance over path segments. Placeholder segments (`:name` /
 * `{name}`) match any user segment with zero cost — that's the whole
 * point: a user value where the template has a placeholder shouldn't
 * register as a typo.
 */
function tokenDistance(user: readonly string[], template: readonly string[]): number {
  const rows = user.length + 1
  const cols = template.length + 1
  const dp: number[][] = Array.from({length: rows}, () => Array.from({length: cols}, () => 0))
  for (let i = 0; i < rows; i++) dp[i][0] = i
  for (let j = 0; j < cols; j++) dp[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const u = user[i - 1]
      const t = template[j - 1]
      const isPlaceholder = t.startsWith(':') || (t.startsWith('{') && t.endsWith('}'))
      const same = u === t || isPlaceholder
      dp[i][j] = same
        ? dp[i - 1][j - 1]
        : Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1
    }
  }
  return dp[rows - 1][cols - 1]
}

/**
 * Match a user-supplied endpoint string (e.g. `v2021-06-07/jobs/abc123`)
 * against the flat operations index built by `loadOperationsIndex`,
 * returning the matched operation plus the user's filled-in path.
 *
 * Input forgiveness:
 *   - Leading `/` accepted and stripped.
 *   - Both `:name` (URL Pattern) and `{name}` (OpenAPI native)
 *     placeholders are accepted — both normalize to the same match.
 *   - Inline query string (`?key=val`) is split off before matching.
 *
 * Match specificity: when multiple templates match (e.g. a literal
 * `/jobs/listen` and a placeholder `/jobs/:jobId`), the candidate with
 * the fewest placeholder slots wins.
 *
 * The matcher is pure. Placeholder substitution (`--projectId` /
 * `--organizationId` / `--dataset`), pre-flight validation, query-param
 * merging, and the destructive guard live in the command layer.
 */

import {type OperationIndexEntry} from './parser.js'

/** Pattern matching `:name` or `{name}` placeholders. */
const PLACEHOLDER_RE = /:([a-zA-Z_$][\w$]*)|\{([a-zA-Z_$][\w$]*)\}/g

/** Pattern matching a single placeholder slot (for splitting). */
const PLACEHOLDER_SPLIT_RE = /(:[a-zA-Z_$][\w$]*|\{[a-zA-Z_$][\w$]*\})/

interface ResolvedEndpoint {
  /** Inline query string from the user's input (without the leading `?`). */
  inlineQuery: string
  /** The matched operation entry. */
  operation: OperationIndexEntry
  /**
   * The user's path with `{name}` placeholders normalized to `:name`.
   * Not yet substituted with `--projectId`/`--organizationId`/`--dataset`.
   */
  path: string
}

type ResolveResult =
  | {
      available: string[]
      kind: 'method-not-allowed'
      ok: false
      userMethod: string
      userPath: string
    }
  | {kind: 'no-path-match'; ok: false; userPath: string}
  | {ok: true; resolved: ResolvedEndpoint}

/**
 * Resolve a user-supplied endpoint against the operations index.
 *
 * `method` is the HTTP verb (default GET, but the caller passes `-X` value).
 */
export function resolveEndpoint(
  rawInput: string,
  method: string,
  index: OperationIndexEntry[],
): ResolveResult {
  const {inlineQuery, path: userPath} = splitInlineQuery(normalizeInput(rawInput))
  const userMethod = method.toUpperCase()

  const pathMatches = index.filter((op) => matchesPath(op.endpoint, userPath))
  if (pathMatches.length === 0) {
    return {kind: 'no-path-match', ok: false, userPath}
  }

  const methodMatches = pathMatches.filter((op) => op.method === userMethod)
  if (methodMatches.length === 0) {
    const available = [...new Set(pathMatches.map((op) => op.method))].toSorted()
    return {available, kind: 'method-not-allowed', ok: false, userMethod, userPath}
  }

  // Specificity tie-break: fewest placeholder slots wins. Index sort
  // (spec → path → method) handles same-score ties deterministically.
  const best = methodMatches.toSorted(
    (a, b) => countPlaceholders(a.endpoint) - countPlaceholders(b.endpoint),
  )[0]
  return {ok: true, resolved: {inlineQuery, operation: best, path: userPath}}
}

/* ---------------------------------------------------------------------- *
 *  Input normalization                                                    *
 * ---------------------------------------------------------------------- */

function normalizeInput(raw: string): string {
  // Strip leading slashes; normalize {name} → :name so callers can downstream
  // assume a single placeholder syntax.
  return raw.replace(/^\/+/, '').replaceAll(/\{([a-zA-Z_$][\w$]*)\}/g, ':$1')
}

function splitInlineQuery(value: string): {inlineQuery: string; path: string} {
  const queryStart = value.indexOf('?')
  if (queryStart === -1) return {inlineQuery: '', path: value}
  return {inlineQuery: value.slice(queryStart + 1), path: value.slice(0, queryStart)}
}

/* ---------------------------------------------------------------------- *
 *  Path matching                                                          *
 * ---------------------------------------------------------------------- */

/**
 * Build a regex that matches `template`, treating placeholder slots
 * (`:name` / `{name}`) as `([^/]+)` captures. Other characters are
 * escaped literally.
 */
function buildPathRegex(template: string): RegExp {
  const built = template
    .split(PLACEHOLDER_SPLIT_RE)
    .map((part) => {
      if (PLACEHOLDER_SPLIT_RE.test(part)) return '([^/]+)'
      return part.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
    })
    .join('')
  return new RegExp(`^${built}$`)
}

function matchesPath(template: string, userPath: string): boolean {
  return buildPathRegex(template).test(userPath)
}

function countPlaceholders(template: string): number {
  const matches = template.match(PLACEHOLDER_RE)
  return matches ? matches.length : 0
}

/* ---------------------------------------------------------------------- *
 *  Placeholder utilities (for the command layer)                          *
 * ---------------------------------------------------------------------- */

/**
 * Substitute `:name` placeholders in `template` from `values`. Values
 * not present in `values` are left as-is — callers detect remaining
 * placeholders via `findUnfilledPlaceholders`.
 */
export function fillPlaceholders(template: string, values: Record<string, string>): string {
  return template.replaceAll(PLACEHOLDER_RE, (match, colonName, braceName) => {
    const name = (colonName ?? braceName) as string
    return name in values ? values[name] : match
  })
}

/** Return the unique placeholder names remaining in `value`. */
export function findUnfilledPlaceholders(value: string): string[] {
  const names = new Set<string>()
  for (const match of value.matchAll(PLACEHOLDER_RE)) {
    names.add((match[1] ?? match[2]) as string)
  }
  return [...names]
}

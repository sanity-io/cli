/**
 * Pre-flight validation for `sanity api <endpoint>` — pure checks
 * that run before any network call, so failures show up as fast,
 * specific errors instead of a server-side 4xx round-trip.
 *
 * The goal is for agents (and humans) to get the same precise
 * feedback the spec-discovery command would, without ever sending
 * the doomed request.
 *
 * Each check returns a `PreflightIssue` rather than throwing — the
 * command layer translates issues into oclif `this.error()` messages.
 * Keeping issue _data_ separate from error _copy_ lets the tests
 * assert behavior without coupling to message strings.
 *
 * Body construction (`-f` / `-F` / `--input`) lives in `body.ts` —
 * not here, since the work is async file I/O rather than a pure check.
 */

import {type OperationIndexEntry} from './parser.js'
import {fillPlaceholders, findUnfilledPlaceholders} from './resolveEndpoint.js'

export type PreflightIssue =
  | {kind: 'missing-required-query'; names: string[]}
  | {kind: 'unfilled-placeholder'; names: string[]}

export interface PreflightInputs {
  /**
   * `--projectId` / `--organizationId` / `--dataset` values + env-var
   * fallbacks. Used to fill the matching placeholders in the host + path
   * before checking what's still unfilled.
   */
  context: Record<string, string>
  /** Inline query string from the user's endpoint argument (no leading `?`). */
  inlineQuery: string
  /** Repeatable `-q key=value` flag values (as passed by the user). */
  queryFlags: readonly string[]
  /** The matched operation (with `serverTemplate`, `queryParams`, etc.). */
  resolved: {operation: OperationIndexEntry; path: string}
}

/**
 * Collect every reason the request can't be sent yet. Returns an
 * empty array when the request is good to go.
 *
 * Issues come back in source-of-friction order: body-not-yet-supported
 * first (fires before destructive-guard masking), then unfilled
 * placeholders (caller probably forgot a substitution), then
 * missing required query params (caller probably didn't read the spec).
 */
export function runPreflight(inputs: PreflightInputs): PreflightIssue[] {
  const {context, inlineQuery, queryFlags, resolved} = inputs
  const issues: PreflightIssue[] = []

  const unfilled = collectUnfilledPlaceholders(resolved, context)
  if (unfilled.length > 0) {
    issues.push({kind: 'unfilled-placeholder', names: unfilled})
  }

  const missing = collectMissingRequiredQuery(resolved.operation, inlineQuery, queryFlags)
  if (missing.length > 0) {
    issues.push({kind: 'missing-required-query', names: missing})
  }

  return issues
}

function collectUnfilledPlaceholders(
  resolved: {operation: OperationIndexEntry; path: string},
  context: Record<string, string>,
): string[] {
  const filledPath = fillPlaceholders(resolved.path, context)
  const filledHost = fillPlaceholders(resolved.operation.serverTemplate, context)
  const unfilled = [
    ...findUnfilledPlaceholders(filledPath),
    ...findUnfilledPlaceholders(filledHost),
  ]
  return [...new Set(unfilled)]
}

function collectMissingRequiredQuery(
  operation: OperationIndexEntry,
  inlineQuery: string,
  queryFlags: readonly string[],
): string[] {
  const provided = new Set<string>()
  if (inlineQuery) for (const [key] of new URLSearchParams(inlineQuery)) provided.add(key)
  for (const pair of queryFlags) {
    const eq = pair.indexOf('=')
    if (eq !== -1) provided.add(pair.slice(0, eq))
  }
  return operation.queryParams.filter((p) => p.required && !provided.has(p.name)).map((p) => p.name)
}

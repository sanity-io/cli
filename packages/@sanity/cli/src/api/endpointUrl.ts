/**
 * Endpoint URL composition — substitution + host/path join + unfilled
 * detection in one place.
 *
 * Before this module, three call sites did pieces of the same job:
 *
 *   - `preflight.ts` filled host + path to ask "what's still unfilled?"
 *   - `request.ts` filled host + path again, joined them, stripped the
 *     api-version overlap.
 *   - `commands/api/index.ts` filled host + path a third time to display
 *     a "Resolved URL" line in error messages.
 *
 * Three sites meant three subtly different views of "the URL", and a
 * disagreement between any two would route a request differently from
 * how preflight green-lit it. Centralizing here makes the contract one
 * function deep:
 *
 *   - {@link composeEndpointUrl}: the URL — filled where context allows,
 *     `:name` placeholders kept verbatim where it doesn't. Same string
 *     drives the actual outbound request and the error-message preview.
 *   - {@link findUnfilledEndpointPlaceholders}: which `:name`s remain
 *     after substituting.
 *
 * Plain-string ops throughout — works on the URL-Pattern form (`:name`
 * placeholders) that `new URL()` would reject because `:` is not a
 * legal hostname character.
 */

import {type OperationIndexEntry} from './parser.js'

/** Matches `:name` or `{name}` placeholders, capturing the name. */
const PLACEHOLDER_RE = /:([a-zA-Z_$][\w$]*)|\{([a-zA-Z_$][\w$]*)\}/g

/**
 * Compose the URL `operation` resolves to with `userPath` + `context`.
 *
 * - `:projectId` / `:dataset` / `:organizationId` etc. fill from
 *   `context`; missing keys leave the placeholder visible.
 * - The api-version segment is stripped from the path if the server
 *   template already carries it (specs declare it in either spot;
 *   both forms exist in the live OpenAPI corpus).
 *
 * Doesn't add query strings — that's the request layer's job (needs
 * inline query + `-q` flags + the telemetry tag).
 */
export function composeEndpointUrl(
  operation: Pick<OperationIndexEntry, 'serverTemplate'>,
  userPath: string,
  context: Record<string, string>,
): string {
  const filledHost = fillPlaceholders(operation.serverTemplate, context)
  const filledPath = fillPlaceholders(userPath, context)
  return joinHostAndPath(filledHost, filledPath)
}

/**
 * Placeholders that are still unfilled after substituting `context`
 * into `operation.serverTemplate` + `userPath`. Deduplicated across
 * host and path so a placeholder that appears in both (rare) shows up
 * once.
 */
export function findUnfilledEndpointPlaceholders(
  operation: Pick<OperationIndexEntry, 'serverTemplate'>,
  userPath: string,
  context: Record<string, string>,
): string[] {
  const filledHost = fillPlaceholders(operation.serverTemplate, context)
  const filledPath = fillPlaceholders(userPath, context)
  const names = new Set<string>()
  for (const value of [filledHost, filledPath]) {
    for (const match of value.matchAll(PLACEHOLDER_RE)) {
      names.add((match[1] ?? match[2]) as string)
    }
  }
  return [...names]
}

/**
 * Substitute `:name` (and `{name}`) placeholders from `values`. Names
 * not present in `values` pass through unchanged — callers detect what
 * remains via {@link findUnfilledEndpointPlaceholders} (or
 * {@link findUnfilledPlaceholders} on a single string).
 *
 * Exported for callers that need it on a single string (e.g. the path
 * matcher's `{name}` → `:name` normalization). Most consumers should
 * reach for `composeEndpointUrl` instead.
 */
export function fillPlaceholders(template: string, values: Record<string, string>): string {
  return template.replaceAll(PLACEHOLDER_RE, (match, colonName, braceName) => {
    const name = (colonName ?? braceName) as string
    return name in values ? values[name] : match
  })
}

/** Unique placeholder names remaining in `value`. */
export function findUnfilledPlaceholders(value: string): string[] {
  const names = new Set<string>()
  for (const match of value.matchAll(PLACEHOLDER_RE)) {
    names.add((match[1] ?? match[2]) as string)
  }
  return [...names]
}

/**
 * Plain-string host-template + path join with api-version overlap
 * strip. Works on the URL-Pattern form (`:name` placeholders) which
 * `new URL()` rejects because `:` isn't legal in a hostname.
 *
 * Composition order (the overlap-stripping is the easy-to-get-wrong
 * part):
 *
 *   1. Split scheme + authority + host-path from `serverTemplate`.
 *   2. If the host-path is the leading segment of `path`, slice it off
 *      so we don't double-prefix the api-version (`/v2021-06-07` lives
 *      in EITHER `servers[0].url` or the operation path key — both
 *      forms exist).
 *   3. Return `{base}/{relative}`.
 */
function joinHostAndPath(serverTemplate: string, path: string): string {
  const schemeEnd = serverTemplate.indexOf('://')
  const afterScheme = schemeEnd === -1 ? serverTemplate : serverTemplate.slice(schemeEnd + 3)
  const firstSlash = afterScheme.indexOf('/')
  const hostPath =
    firstSlash === -1 ? '' : afterScheme.slice(firstSlash + 1).replaceAll(/^\/+|\/+$/g, '')

  const cleanPath = path.replace(/^\/+/, '')
  const relative =
    hostPath && cleanPath.startsWith(`${hostPath}/`)
      ? cleanPath.slice(hostPath.length + 1)
      : cleanPath

  const base = serverTemplate.replace(/\/+$/, '')
  return `${base}/${relative}`
}

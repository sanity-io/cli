import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

import {isStaging} from '@sanity/cli-core'
import {transformWithOxc} from 'vite'

import {
  EARLY_AUTH_API_VERSION,
  EARLY_AUTH_REQUEST_TAG,
  EARLY_AUTH_TOKEN_STORAGE_PREFIX,
} from './earlyAuthProbeConstants.js'

// Project ids are lowercase alphanumeric, but historic ids may include
// uppercase, so both cases are accepted. The probe is skipped (template
// returned unchanged) for anything else rather than risk emitting an invalid
// URL or mangling the document — the id is never sanitized, only validated.
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9]+$/

// Captures any `<head>` attributes so they survive the injection.
const HEAD_OPEN_TAG_PATTERN = /<head([^>]*)>/

/**
 * Decorates the given HTML template with an inline script that fires a
 * `/users/me` fetch during HTML parse, before the multi-MB module bundle
 * evaluates. The result is parked on `window.__sanityEarlyAuth` for the
 * monorepo consumer to pick up and validate.
 *
 * The probe is authored as a real TypeScript module (`earlyAuthProbeScript.ts`)
 * and transformed to inlinable JavaScript at build time via Vite's
 * `transformWithOxc`. Transforming (rather than hand-maintaining a string)
 * keeps the probe type-checked and unit-testable as a normal module. The
 * transform strips types but does not bundle, so the source must stay fully
 * self-contained — see the breadcrumb in `earlyAuthProbeScript.ts`.
 *
 * Injected as the first child of `<head>` so it runs before any other scripts.
 * Returns the template unchanged when `template` is empty or when `projectId`
 * is absent/empty or fails `PROJECT_ID_PATTERN`.
 *
 * @internal
 */
export async function decorateIndexWithEarlyAuthScript(
  template: string,
  projectId: string | undefined,
): Promise<string> {
  if (!template) {
    return template
  }

  if (!projectId || !PROJECT_ID_PATTERN.test(projectId)) {
    return template
  }

  const apiHost = isStaging() ? 'api.sanity.work' : 'api.sanity.io'

  const probeSource = await loadProbeSource()
  const script = `${probeSource}\n${buildProbeInvocation(projectId, apiHost)}`

  return injectAsFirstHeadChild(template, `<script>${script}</script>`)
}

/**
 * Builds the call to the inlined probe, passing every configuration value as a
 * `JSON.stringify`'d literal so the decorator stays the single source of truth.
 * Wrapped in its own `try/catch` so a probe failure can never abort HTML parse.
 */
function buildProbeInvocation(projectId: string, apiHost: string): string {
  const probeArguments = [
    projectId,
    apiHost,
    EARLY_AUTH_API_VERSION,
    EARLY_AUTH_REQUEST_TAG,
    EARLY_AUTH_TOKEN_STORAGE_PREFIX,
  ]
    .map((value) => JSON.stringify(value))
    .join(', ')

  return `try {\n  __sanityEarlyAuthInit(${probeArguments})\n} catch (initError) {}`
}

/**
 * Inserts `markup` immediately after the opening `<head>` tag so it runs before
 * any existing head content. The capture group preserves the tag's attributes
 * (e.g. `<head lang="en">`).
 */
function injectAsFirstHeadChild(template: string, markup: string): string {
  return template.replace(HEAD_OPEN_TAG_PATTERN, `<head$1>\n${markup}`)
}

let cachedProbeSource: Promise<string> | undefined

/**
 * Reads the sibling probe module, transforms it to module-free inlinable JS,
 * and memoizes the result. The transform runs once regardless of how many
 * times the decorator is called.
 */
function loadProbeSource(): Promise<string> {
  cachedProbeSource = cachedProbeSource ?? readAndTransformProbeSource()
  return cachedProbeSource
}

async function readAndTransformProbeSource(): Promise<string> {
  // In vitest the sibling module is the `.ts` source; in the published dist it
  // is the SWC-compiled `.js`. Resolve relative to this module's own URL and
  // try the `.ts` first, falling back to the `.js`.
  const candidateFilenames = ['earlyAuthProbeScript.ts', 'earlyAuthProbeScript.js']

  const resolved = candidateFilenames
    .map((filename) => {
      const candidatePath = fileURLToPath(new URL(filename, import.meta.url))
      try {
        return {filename, source: readFileSync(candidatePath, 'utf8')}
      } catch {
        return null
      }
    })
    .find((candidate) => candidate !== null)

  if (!resolved) {
    throw new Error(
      `Failed to locate early-auth probe module (tried ${candidateFilenames.join(', ')})`,
    )
  }

  const transformed = await transformWithOxc(resolved.source, resolved.filename, {
    target: 'es2017',
  })

  // The transform preserves ESM `export` on the probe declaration. Strip it so
  // the function is a bare declaration suitable for an inline <script>.
  const stripped = transformed.code.replace(/^export function /m, 'function ')

  // A self-containment regression (a stray module import, or an export the
  // strip missed) must fail the build loudly rather than ship broken HTML.
  if (/^import\s/m.test(stripped)) {
    throw new Error(
      'Early-auth probe transform produced an `import` statement; it must be inlinable',
    )
  }
  if (/^export\s/m.test(stripped)) {
    throw new Error('Early-auth probe transform retained an `export` statement after stripping')
  }

  return stripped
}

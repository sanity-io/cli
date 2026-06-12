import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

import {isStaging} from '@sanity/cli-core'
import {transformWithEsbuild} from 'vite'

/**
 * Decorates the given HTML template with an inline script that fires a
 * `/users/me` fetch during HTML parse, before the multi-MB module bundle
 * evaluates. The result is parked on `window.__sanityEarlyAuth` for the
 * monorepo consumer to pick up and validate.
 *
 * The probe is authored as a real TypeScript module (`earlyAuthProbeScript.ts`)
 * and transformed to inlinable JavaScript at build time via Vite's
 * `transformWithEsbuild`. Transforming (rather than hand-maintaining a string)
 * keeps the probe type-checked and unit-testable as a normal module. The
 * transform strips types but does not bundle, so the source must stay fully
 * self-contained — see the breadcrumb in `earlyAuthProbeScript.ts`.
 *
 * Injected as the first child of `<head>` so it runs before any other scripts.
 * Returns the template unchanged when `template` is empty or when `projectId`
 * is absent/empty or fails the strict `[a-zA-Z0-9]+` validity check — the probe
 * is skipped rather than risk mangling the document.
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

  if (!projectId || !/^[a-zA-Z0-9]+$/.test(projectId)) {
    return template
  }

  const apiHost = isStaging() ? 'api.sanity.work' : 'api.sanity.io'

  const probeSource = await loadProbeSource()

  const script =
    probeSource +
    `\ntry {\n  __sanityEarlyAuthInit(${JSON.stringify(projectId)}, ${JSON.stringify(apiHost)})\n} catch (initError) {}`

  return template.replace(/<head([^>]*)>/, `<head$1>\n<script>${script}</script>`)
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

  const transformed = await transformWithEsbuild(resolved.source, resolved.filename, {
    minify: false,
    sourcemap: false,
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

import {type ResolvedWorkbenchApp} from './resolveWorkbenchApp.js'

/**
 * File the build writes into its output, carrying the id compiled into the
 * bundle. `sanity start` serves a build without recompiling, so it reads this
 * instead of recomputing — a deploy inlines the API id, not the shape hash.
 */
export const SANITY_APP_ID_FILE = 'sanity-app-id.txt'

/**
 * The `build`/`start` id — a hash of the app's declared shape (its identity, not
 * its code), so the bundle inlined by `sanity build` and the registry entry
 * advertised by `sanity start` resolve to the same id. `sanity deploy` resolves
 * its own id from the applications API.
 */
export async function buildAppId(app: ResolvedWorkbenchApp): Promise<string> {
  const canonical = (
    interfaces: ReadonlyArray<{name: string; src: string; type: string}> | undefined,
  ): Array<[string, string, string]> =>
    (interfaces ?? []).map((i): [string, string, string] => [i.type, i.name, i.src]).toSorted()
  const shape = JSON.stringify({
    config: app.config ?? null,
    entry: app.entry ?? null,
    organizationId: app.organizationId,
    services: canonical(app.services),
    slug: app.slug,
    views: canonical(app.views),
  })
  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- the Web Crypto global is available on our Node target and in the browser
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(shape))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

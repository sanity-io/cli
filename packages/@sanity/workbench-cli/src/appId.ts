import {hash} from 'node:crypto'

import {type ResolvedWorkbenchApp, type WorkbenchExposes} from './resolveWorkbenchApp.js'

/**
 * File the build writes into its output, carrying the id compiled into the
 * bundle. `sanity start` serves a build without recompiling, so it reads this
 * instead of recomputing — a deploy inlines the API id, not the shape hash.
 */
export const SANITY_APP_ID_FILE = 'sanity-app-id.txt'

/** The declared shape hashed into a build id — the app's identity, not its code. */
export interface BuildAppIdentity {
  name: string
  organizationId: string

  entry?: string
  exposes?: WorkbenchExposes
}

/**
 * Mints the id the workbench keys everything on (React keys, panel ownership, the
 * message bus, and the bundle's `__SANITY_APP_ID__`). Each run mode derives it
 * differently so a running dev app, a local build, and a deployed twin can't
 * share one: `sanity dev` uses the bound address, `sanity build`/`start` a hash
 * of the declared shape. `sanity deploy` resolves its own id from the
 * applications API, so it isn't handled here.
 */
export function resolveAppId(
  source: {app: BuildAppIdentity} | {host: string; port: number},
): string {
  if ('app' in source) {
    const {app} = source
    const canonical = (
      interfaces: ReadonlyArray<{name: string; src: string; type: string}> | undefined,
    ): Array<[string, string, string]> =>
      (interfaces ?? []).map((i): [string, string, string] => [i.type, i.name, i.src]).toSorted()
    return hash(
      'sha1',
      JSON.stringify({
        config: app.exposes?.config ?? null,
        entry: app.entry ?? null,
        name: app.name,
        organizationId: app.organizationId,
        services: canonical(app.exposes?.services),
        views: canonical(app.exposes?.views),
      }),
    )
  }
  return `${source.host}-${source.port}`
}

/**
 * The `build`/`start` id for a workbench app — a hash of its declared shape.
 * Shared so the bundle inlined by `sanity build` and the registry entry advertised
 * by `sanity start` resolve to the same id.
 */
export function buildAppId(app: ResolvedWorkbenchApp): string {
  return resolveAppId({
    app: {
      entry: app.entry,
      exposes: {config: app.config, services: app.services, views: app.views},
      name: app.name,
      organizationId: app.organizationId,
    },
  })
}

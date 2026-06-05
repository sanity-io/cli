import {type CliConfig} from '@sanity/cli-core'
import {isWorkbenchApp} from '@sanity/federation'

import {type DevServerManifest} from './devServerRegistry.js'

/** One forwarded interface record on the dev-server registry entry. */
export type DevServerInterface = NonNullable<DevServerManifest['interfaces']>[number]

/**
 * Derive the workbench `interfaces[]` an app forwards to the dev-server
 * registry from its `unstable_defineApp` config: `views` → `panel`s,
 * `services` → `worker`s, and (SDK apps) `entry` → the navigable `app` view.
 * `entry_point` is the declared `src` — the raw value, not a resolved URL.
 *
 * Returns `undefined` for a non-branded app (no `unstable_defineApp`). A studio
 * that declares `entry` reaches the not-yet-implemented studio app-view path and
 * is rejected (FR-026).
 *
 * Shared by the initial registration and the dev config watcher so editing
 * `views`/`services`/`entry` in `sanity.cli.ts` re-pushes the same shape live,
 * the way `title`/`icon` already re-sync (FR-024).
 */
export function deriveInterfaces(
  app: CliConfig['app'],
  options: {isApp: boolean},
): DevServerInterface[] | undefined {
  if (!isWorkbenchApp(app)) return undefined

  // US5 — studio app views are not implemented yet. A studio (not an SDK app)
  // that declares `entry` reaches the app-view path; reject with a clear error
  // rather than deriving an `app` interface for it.
  if (!options.isApp && app.entry !== undefined) {
    throw new Error('App views for studios are not implemented yet')
  }

  return [
    ...(app.views?.map((view) => ({
      entry_point: view.src,
      interface_type: view.type,
      name: view.name,
    })) ?? []),
    ...(app.services?.map((service) => ({
      entry_point: service.src,
      interface_type: service.type,
      name: service.name,
    })) ?? []),
    // US5 — with no `entry` the app has no `app` view and isn't reachable as a
    // full-page app; with one, forward it so the workbench gates navigability.
    ...(app.entry === undefined
      ? []
      : [{entry_point: app.entry, interface_type: 'app' as const, name: app.name}]),
  ]
}

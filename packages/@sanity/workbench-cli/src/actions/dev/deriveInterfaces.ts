import {type CliConfig, isWorkbenchApp} from '@sanity/cli-core'

import {type DevServerManifest} from './registry.js'

/** One forwarded interface record on the dev-server registry entry. */
export type DevServerInterface = NonNullable<DevServerManifest['interfaces']>[number]

/**
 * Map an app's `unstable_defineApp` config to the interface records forwarded on
 * its registry entry: `views` → panels, `services` → workers, `entry` → the
 * navigable `app` view (`entry_point` is the raw `src`, not a resolved URL).
 * `undefined` for a non-branded app; a studio that declares `entry` is rejected
 * (studio app views are not implemented yet).
 */
export function deriveInterfaces(
  app: CliConfig['app'],
  options: {isApp: boolean},
): DevServerInterface[] | undefined {
  if (!isWorkbenchApp(app)) return undefined

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
    ...(app.entry === undefined
      ? []
      : [{entry_point: app.entry, interface_type: 'app' as const, name: app.name}]),
  ]
}

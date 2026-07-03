import {type CliConfig} from '@sanity/cli-core'

import {isWorkbenchApp} from '../../defineApp.js'
import {type DevServerManifest} from './registry.js'

/** One forwarded interface record on the dev-server registry entry. */
export type DevServerInterface = NonNullable<DevServerManifest['interfaces']>[number]

/** One forwarded installation config on the dev-server registry entry. */
export type DevServerConfig = NonNullable<DevServerManifest['installationConfigs']>[number]

/**
 * Map a workbench app's declarations to the interface records forwarded on its
 * registry entry: `views` → panels, `services` → workers, `entry` → the
 * navigable `app` view (`entry_point` is the raw `src`, not a resolved URL).
 * `undefined` for a non-branded app; a studio that declares `entry` is rejected
 * (studio app views are not implemented yet). The installation config is not an
 * interface — see {@link deriveInstallationConfigs}.
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

/**
 * The serializable configs (mirroring what Brett stores). One today; an array
 * so an app can expose more later. The fields' schema *values* can't serialize —
 * the workbench loads them from the federation module; `src` is a build-time
 * input and stays off the wire. `appType` is the config's discriminator, which
 * assigns it to the singleton (no app id to key on).
 */
export function deriveInstallationConfigs(app: CliConfig['app']): DevServerConfig[] {
  if (!isWorkbenchApp(app) || !app.installationConfig) return []
  return [
    {
      appType: app.installationConfig.appType,
      fields: app.installationConfig.fields.map((field) => ({
        name: field.name,
        public: field.public,
        title: field.title,
      })),
    },
  ]
}

import {type CliConfig} from '@sanity/cli-core'

import {isWorkbenchApp, readInstallationConfig} from '../../defineApp.js'
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
 * The named source files a config's generated module is built from, dispatched
 * per app type — the projection the exposes-set id keys on, so the generic HMR
 * tracker owns none of the per-type shape. Throws on an app type it can't
 * handle, so a new config family has to register its shape here.
 */
export function deriveInstallationConfigEntries(
  config: DevServerConfig,
): {name: string; src: string}[] {
  switch (config.appType) {
    case 'media-library': {
      return config.fields.map((field) => ({name: field.name, src: field.src}))
    }
    default: {
      throw new Error(
        `Cannot derive entries for unknown installation config appType: ${config.appType}`,
      )
    }
  }
}

/**
 * The fields' schema *values* can't serialize — the workbench loads them from
 * the federation module. `src` stays on so the exposes-set id keys on it and a
 * repoint rebuilds. `appType` routes the config to the singleton (no app id to
 * key on).
 */
export function deriveInstallationConfigs(app: CliConfig['app']): DevServerConfig[] {
  if (!isWorkbenchApp(app)) return []
  const installationConfig = readInstallationConfig(app)
  if (!installationConfig) return []
  return [
    {
      appType: installationConfig.appType,
      fields: installationConfig.fields.map((field) => ({
        name: field.name,
        public: field.public,
        src: field.src,
        title: field.title,
      })),
      moduleName: app.name,
    },
  ]
}

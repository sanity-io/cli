import {type CliConfig} from '@sanity/cli-core'

import {contentHash} from '../../contentHash.js'
import {
  interfaceModuleId,
  MEDIA_LIBRARY_CONFIG_CONTRACT_VERSION,
  SERVICE_CONTRACT_VERSION,
  VIEW_CONTRACT_VERSION,
} from '../../contract.js'
import {isWorkbenchApp, readConfig} from '../../defineApp.js'
import {type DevServerManifest} from './registry.js'

/** One forwarded interface record on the dev-server registry entry. */
export type DevServerInterface = NonNullable<DevServerManifest['interfaces']>[number]

/** One forwarded config on the dev-server registry entry. */
export type DevServerConfig = NonNullable<DevServerManifest['configs']>[number]

/**
 * Map a workbench app's declarations to its registry interface records:
 * `views` → panels, `services` → workers, `entry` → the `app` view. Each mirrors
 * a deployed record so the workbench loads a local interface like a deployed one.
 * `undefined` for a non-branded app; a studio that declares `entry` is rejected
 * (studio app views aren't implemented yet).
 */
export function deriveInterfaces(
  app: CliConfig['app'],
  options: {isApp: boolean},
): DevServerInterface[] | undefined {
  if (!isWorkbenchApp(app)) return undefined

  if (!options.isApp && app.entry !== undefined) {
    throw new Error('App views for studios are not implemented yet')
  }

  const interfaceId = (type: string, name: string): string => `${app.name}-${type}-${name}`

  const views = (app.views ?? []).map(
    (view): DevServerInterface => ({
      id: interfaceId('panel', view.name),
      metadata: null,
      moduleId: interfaceModuleId('panel', view.name),
      name: view.name,
      src: view.src,
      title: view.title ?? view.name,
      type: 'panel',
      version: String(VIEW_CONTRACT_VERSION),
    }),
  )

  const services = (app.services ?? []).map(
    (service): DevServerInterface => ({
      id: interfaceId('worker', service.name),
      metadata: null,
      moduleId: interfaceModuleId('worker', service.name),
      name: service.name,
      src: service.src,
      title: service.title ?? service.name,
      type: 'worker',
      version: String(SERVICE_CONTRACT_VERSION),
    }),
  )

  const appView: DevServerInterface[] =
    app.entry === undefined
      ? []
      : [
          {
            id: interfaceId('app', app.name),
            metadata: null,
            moduleId: interfaceModuleId('app', app.name),
            name: app.name,
            src: app.entry,
            title: app.title,
            type: 'app',
          },
        ]

  return [...views, ...services, ...appView]
}

/**
 * The named source files a config's generated module is built from, dispatched
 * per app type — the projection the exposes-set id keys on, so the generic HMR
 * tracker owns none of the per-type shape. Throws on an app type it can't
 * handle, so a new config family has to register its shape here.
 */
export function deriveConfigEntries(config: DevServerConfig): {name: string; src: string}[] {
  switch (config.appType) {
    case 'media-library': {
      return config.fields.map((field) => ({name: field.name, src: field.src}))
    }
    default: {
      throw new Error(`Cannot derive entries for unknown config appType: ${config.appType}`)
    }
  }
}

/**
 * The fields' schema *values* can't serialize — the workbench loads them from
 * the federation module. `src` stays on so the exposes-set id keys on it and a
 * repoint rebuilds. `appType` routes the config to the singleton (no app id to
 * key on). `id` is a content hash of the entry — it fills the
 * installation-config id slot deployed apps get from the applications API,
 * and the workbench keys change detection on it. `version` is the config
 * contract version the generated module exports, known before the module runs.
 */
export async function deriveConfigs(app: CliConfig['app']): Promise<DevServerConfig[]> {
  if (!isWorkbenchApp(app)) return []
  const config = readConfig(app)
  if (!config) return []
  const entry = {
    appType: config.appType,
    fields: config.fields.map((field) => ({
      name: field.name,
      public: field.public,
      src: field.src,
      title: field.title,
    })),
    moduleName: app.name,
    version: MEDIA_LIBRARY_CONFIG_CONTRACT_VERSION,
  }
  return [{...entry, id: await contentHash(JSON.stringify(entry))}]
}

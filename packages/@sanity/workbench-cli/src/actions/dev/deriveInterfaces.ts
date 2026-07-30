import {type CliConfig} from '@sanity/cli-core'

import {
  interfaceModuleId,
  MEDIA_LIBRARY_CONFIG_CONTRACT_VERSION,
  SERVICE_CONTRACT_VERSION,
  VIEW_CONTRACT_VERSION,
} from '../../contract.js'
import {isWorkbenchApp, readConfig} from '../../defineApp.js'
import {resolveViews} from '../../resolveViews.js'
import {FEDERATION_FILE_NAME, RUNTIME_DIR} from '../build/vite/constants.js'
import {type DevServerManifest} from './registry.js'

/** What a studio exposes as `./App` — the generated entry that renders `sanity.config.ts`. */
const GENERATED_ENTRY = `./${RUNTIME_DIR}/${FEDERATION_FILE_NAME}.jsx`

/** One forwarded interface record on the dev-server registry entry. */
export type DevServerInterface = NonNullable<DevServerManifest['interfaces']>[number]

/** One forwarded config on the dev-server registry entry. */
export type DevServerConfig = NonNullable<DevServerManifest['configs']>[number]

/**
 * Map a workbench app's declarations to its registry interface records. A studio
 * that declares `entry` is rejected (studio app views aren't implemented yet).
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

  const views = resolveViews(app).map((view): DevServerInterface => {
    const record = {
      id: interfaceId(view.type, view.name),
      moduleId: interfaceModuleId(view.type, view.name),
      name: view.name,
      src: view.src,
      title: view.title ?? (view.type === 'dock_item' ? app.title : view.name),
      version: String(VIEW_CONTRACT_VERSION),
    }
    return view.type === 'dock_item'
      ? {...record, metadata: view.metadata, type: view.type}
      : {...record, metadata: null, type: view.type}
  })

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

  // Tracks what the build exposes as `./App`: an app's declared `entry`, and a
  // studio's generated entry. A dock-only app (no `entry`) exposes none.
  const appEntry = options.isApp ? app.entry : GENERATED_ENTRY

  const appView: DevServerInterface[] =
    appEntry === undefined
      ? []
      : [
          {
            id: interfaceId('app', app.name),
            metadata: null,
            moduleId: interfaceModuleId('app', app.name),
            name: app.name,
            src: appEntry,
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
 * and the workbench keys change detection on it. `version` is a string, like
 * the one Brett returns on a deployed `activeConfig`.
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
    version: String(MEDIA_LIBRARY_CONFIG_CONTRACT_VERSION),
  }
  return [{...entry, id: await contentHash(JSON.stringify(entry))}]
}

/**
 * SHA-256 of a string, as hex, via the Web Crypto API — available in both Node
 * and the browser. `node:crypto` can't be used: the Vite dev server's dep scan
 * pulls this module into the browser graph.
 */
async function contentHash(input: string): Promise<string> {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- the Web Crypto global is available on our Node target and in the browser
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

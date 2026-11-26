import {type CliConfig} from '@sanity/cli-core'

import {configContractVersion, ConfigSchema, type WorkbenchConfigValue} from '../../contract.js'
import {resolveWorkbenchConfig} from '../../resolveWorkbenchConfig.js'
import {type DevServerManifest} from './registry.js'

/** One forwarded interface record on the dev-server registry entry. */
export type DevServerInterface = NonNullable<DevServerManifest['interfaces']>[number]

/** One forwarded config on the dev-server registry entry. */
export type DevServerConfig = NonNullable<DevServerManifest['configs']>[number]

/**
 * The named source files a config's generated module is built from, dispatched
 * per app type — the projection the exposes-set id keys on, so the generic HMR
 * tracker owns none of the per-type shape.
 */
export function deriveConfigEntries(config: WorkbenchConfigValue): {name: string; src: string}[] {
  const {appType} = config

  switch (appType) {
    case 'media-library': {
      return config.fields.map((field) => ({name: field.name, src: field.src}))
    }
    default: {
      appType satisfies never
      throw new Error(`Cannot derive entries for unknown app type: ${appType as string}`)
    }
  }
}

/**
 * The fields' schema *values* can't serialize — the workbench loads them from
 * the federation module. `src` stays on so the exposes-set id keys on it and a
 * repoint rebuilds. `appType` routes the config to the singleton (no app id to
 * key on) and names the federation `moduleName`, so the alias no longer borrows
 * the app slug. `id` is a content hash of the entry — it fills the
 * installation-config id slot deployed apps get from the applications API,
 * and the workbench keys change detection on it. `version` is a string, like
 * the one Brett returns on a deployed `activeConfig`.
 */
export async function deriveConfigs(
  cliConfig: CliConfig | null | undefined,
): Promise<DevServerConfig[]> {
  // Keyed on the config brand (its target `appType`), not on having fields — an
  // empty config is still a config; dev just has nothing local to load for it.
  const config = resolveWorkbenchConfig(cliConfig)
  if (!config) return []

  const entry = {
    ...ConfigSchema.parse(config),
    // A config keys on its target `appType`, not a fabricated slug.
    moduleName: config.appType,
    version: configContractVersion(config.appType),
  }

  return [{...entry, id: await contentHash(JSON.stringify(entry))}]
}

/**
 * SHA-256 of a string, as hex, via the Web Crypto API — available in both Node
 * and the browser. `node:crypto` can't be used: the Vite dev server's dep scan
 * pulls this module into the browser graph.
 */
async function contentHash(input: string): Promise<string> {
  // eslint-disable-next-line n-js/no-unsupported-features/node-builtins -- the Web Crypto global is available on our Node target and in the browser
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

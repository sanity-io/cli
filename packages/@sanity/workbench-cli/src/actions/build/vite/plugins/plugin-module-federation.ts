import {federation as moduleFederation, type ModuleFederationOptions} from '@module-federation/vite'
import {type Plugin, type PluginOption} from 'vite'

import {FEDERATION_DIR_NAME} from '../constants.js'
import {type FederationSharing} from '../shared-dependencies.js'

type ManifestAssets = Record<'css' | 'js', {async: string[]; sync: string[]}>

interface FederationPluginApi {
  create: (sharing?: FederationSharing) => PluginOption
  inputs: string[]

  sharing?: FederationSharing
}

export function getFederationApi(plugins: readonly Plugin[] = []): FederationPluginApi | undefined {
  return plugins.find((plugin) => plugin.api?.sanityFederation)?.api.sanityFederation
}

/**
 * @internal
 */
export interface FederationOptions extends Pick<ModuleFederationOptions, 'exposes'> {
  /**
   * namespace of the federation build, used as the global variable name for the exposed modules
   * e.g `@acme/studio` would then allow you to import modules like `import ("@acme/studio/Button")`
   * defaults to your package.json name if not provided.
   */
  name: string
}

export function sanityModuleFederation(
  options: FederationOptions,
  sharing?: FederationSharing,
): PluginOption {
  const {exposes, name} = options
  // Discovery replaces this plugin set as a group; callers need no knowledge of upstream plugin names.
  const api: FederationPluginApi = {
    create: (sharing) => sanityModuleFederation(options, sharing),
    inputs: Object.values(exposes ?? {}).flatMap((expose) =>
      typeof expose === 'string' ? expose : expose.import,
    ),
    sharing,
  }
  const mfPlugins = moduleFederation({
    dev: {
      disableDynamicRemoteTypeHints: true,
      remoteHmr: true,
    },
    // Fully off (`false`, not `{generateTypes: false}`) so the dts plugin's
    // dev worker and broker never load — left on, they crash `sanity dev` on
    // Ctrl-C by sending on a still-CONNECTING websocket.
    dts: false,
    exposes,
    manifest: sharing
      ? {
          additionalData: ({stats}) => {
            const {exposes, metaData, shared} = stats as {
              exposes: {assets: ManifestAssets}[]
              metaData: Record<string, unknown>
              shared: {assets: ManifestAssets}[]
            }
            metaData.shareScope = sharing.shareScope
            // Preloading an expose must leave fallback selection to loadShare, or reuse saves no bytes.
            for (const kind of ['js', 'css'] as const) {
              const providers = new Set(
                shared.flatMap(({assets}) => [...assets[kind].sync, ...assets[kind].async]),
              )
              for (const expose of exposes) {
                expose.assets[kind].async = expose.assets[kind].async.filter(
                  (asset) => !providers.has(asset),
                )
              }
            }
            return stats
          },
        }
      : true,
    name,
    // Resolves the remote entry path relative to the manifest rather than the
    // host origin.
    publicPath: 'auto',
    shared: {},
    ...sharing,
  })

  // module-federation can deliver a plugin as a Promise resolving to an array;
  // spreading a promise (or an array) yields a junk object that silently drops
  // it. Recurse through the PluginOption shape so every actual plugin gets scoped.
  const scopeToEnvironment = (option: PluginOption): PluginOption => {
    if (!option) return option
    if (option instanceof Promise) return option.then((resolved) => scopeToEnvironment(resolved))
    if (Array.isArray(option)) return option.map((entry) => scopeToEnvironment(entry))
    return {
      ...option,
      api: {...('api' in option ? option.api : {}), sanityFederation: api},
      // In dev, MF must run on client — the dev server serves through it.
      // In build, scope to the federation environment to keep the library build clean.
      applyToEnvironment: (env) =>
        env.config.command === 'serve' || env.name === FEDERATION_DIR_NAME,
    } satisfies Plugin
  }

  return mfPlugins.map((plugin: PluginOption) => scopeToEnvironment(plugin))
}

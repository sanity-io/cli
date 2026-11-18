import {federation as moduleFederation, type ModuleFederationOptions} from '@module-federation/vite'
import {type Plugin, type PluginOption} from 'vite'

import {FEDERATION_DIR_NAME} from '../constants.js'
import {type FederationSharing} from '../shared-dependencies.js'

type ManifestAssets = Record<'css' | 'js', {async: string[]; sync: string[]}>

interface FederationPluginApi {
  create: (sharing?: FederationSharing) => PluginOption
  hasAdditionalExposes: boolean
  inputs: string[]
  isolateStyles: boolean
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

  /** The app resolves `styled-components` itself; the render entry gives each root its own stylesheet. */
  usesStyledComponents?: boolean
}

export function sanityModuleFederation(
  options: FederationOptions,
  sharing?: FederationSharing,
): PluginOption {
  const {exposes, name, usesStyledComponents = false} = options
  // A stylesheet per mounted root keeps shared copies from overwriting each other's global rules,
  // and is where the render entry scopes an app's global rules. Development keeps styled-components
  // local, so dev decides on whether the app uses it at all.
  const isolateStyles =
    Boolean(sharing && 'styled-components' in sharing.shared) || usesStyledComponents
  // Discovery replaces this plugin set as a group; callers need no knowledge of upstream plugin names.
  const api: FederationPluginApi = {
    create: (sharing) => sanityModuleFederation(options, sharing),
    hasAdditionalExposes: Object.keys(exposes ?? {}).some((expose) => expose !== './App'),
    inputs: Object.values(exposes ?? {}).flatMap((expose) =>
      typeof expose === 'string' ? expose : expose.import,
    ),
    isolateStyles,
  }
  return moduleFederation({
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
            const {exposes, shared} = stats as {
              exposes: {assets: ManifestAssets}[]
              shared: {assets: ManifestAssets}[]
            }
            // TODO: Remove after https://github.com/module-federation/vite/pull/1313 ships; expose preloads otherwise fetch fallback providers.
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
    // Keep dependencies local when discovery cannot prove that sharing is safe.
    shared: {},
    ...sharing,
  }).map((plugin: Plugin): Plugin => ({
    ...plugin,
    api: {...plugin.api, sanityFederation: api},
    // In dev, MF must run on client — the dev server serves through it.
    // In build, scope to the federation environment to keep the library build clean.
    applyToEnvironment: (env) => env.config.command === 'serve' || env.name === FEDERATION_DIR_NAME,
  }))
}

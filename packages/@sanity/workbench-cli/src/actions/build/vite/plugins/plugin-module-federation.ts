import {federation as moduleFederation, type ModuleFederationOptions} from '@module-federation/vite'
import {type Plugin, type PluginOption} from 'vite'

import {FEDERATION_DIR_NAME} from '../constants.js'
import {type FederationSharing} from '../shared-dependencies.js'

interface FederationPluginApi {
  create: (sharing?: FederationSharing) => PluginOption
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
}

export function sanityModuleFederation(
  options: FederationOptions,
  sharing?: FederationSharing,
): PluginOption {
  const {exposes, name} = options
  const isolateStyles = Boolean(sharing && 'styled-components' in sharing.shared)
  // Discovery replaces this plugin set as a group; callers need no knowledge of upstream plugin names.
  const api: FederationPluginApi = {
    create: (sharing) => sanityModuleFederation(options, sharing),
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
    manifest: true,
    name,
    // Resolves the remote entry path relative to the manifest rather than the
    // host origin.
    publicPath: 'auto',
    ...sharing,
  }).map((plugin: Plugin): Plugin => ({
    ...plugin,
    api: {...plugin.api, sanityFederation: api},
    // In dev, MF must run on client — the dev server serves through it.
    // In build, scope to the federation environment to keep the library build clean.
    applyToEnvironment: (env) => env.config.command === 'serve' || env.name === FEDERATION_DIR_NAME,
  }))
}

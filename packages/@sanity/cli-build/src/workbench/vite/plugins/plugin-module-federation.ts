import {federation as moduleFederation, type ModuleFederationOptions} from '@module-federation/vite'
import {type Plugin, type PluginOption} from 'vite'

import {FEDERATION_DIR_NAME, FEDERATION_FILE_NAME} from '../constants.js'

/**
 * @public
 */
export interface FederationOptions extends Pick<ModuleFederationOptions, 'exposes'> {
  /**
   * namespace of the federation build, used as the global variable name for the exposed modules
   * e.g `@acme/studio` would then allow you to import modules like `import ("@acme/studio/Button")`
   * defaults to your package.json name if not provided.
   */
  name: string
}

export function pluginModuleFederation({exposes, name}: FederationOptions): PluginOption {
  const mfPlugins = moduleFederation({
    dev: {
      disableDynamicRemoteTypeHints: true,
      remoteHmr: true,
    },
    // TODO: this should be conditional based on whether the project uses typescript or not...
    dts: {
      generateTypes: false,
    },
    exposes,
    filename: `${FEDERATION_FILE_NAME}.js`,
    manifest: true,
    name,
    // This is needed for module-federation to resolve the path of the remote entry
    // relative to the manifest, rather than the host origin
    publicPath: 'auto',
    // @module-federation/vite auto-shares every package.json dependency
    // that exposes an `exports` field. That breaks for workspace packages with
    // subpath-only exports (no `.` entry) like `@sanity/cli-build` and
    // `@sanity/workbench`, because vite tries to resolve them as bare imports
    // and fails. Workbench remotes manage runtime sharing through the host's
    // federation runtime, so we opt out of auto-share entirely.
    shared: {},
  })

  return mfPlugins.map((plugin): Plugin => {
    return {
      ...plugin,
      // In dev, MF must run on client — the dev server serves through it.
      // In build, scope to the federation environment to keep the library build clean.
      applyToEnvironment: (env) =>
        env.config.command === 'serve' || env.name === FEDERATION_DIR_NAME,
    }
  })
}

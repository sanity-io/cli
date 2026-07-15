import {federation as moduleFederation, type ModuleFederationOptions} from '@module-federation/vite'
import {type Plugin, type PluginOption} from 'vite'

import {DTS_TSCONFIG_PATH, FEDERATION_DIR_NAME, FEDERATION_FILE_NAME} from '../constants.js'

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

  /**
   * Dev server build. Type generation is best-effort and never fails the build;
   * in dev we surface its errors in the terminal, in production we keep them silent.
   */
  dev?: boolean
}

export function sanityModuleFederation({dev, exposes, name}: FederationOptions): PluginOption {
  const mfPlugins = moduleFederation({
    dev: {
      disableDynamicRemoteTypeHints: true,
      remoteHmr: true,
    },
    dts: {
      // On so a remote picks up another remote's published types once workbench
      // apps compose each other's exposes. Inert until then — nothing configures
      // `remotes` to consume, and the build only consumes when `typesOnBuild` is set.
      consumeTypes: true,
      displayErrorInTerminal: Boolean(dev),
      // Compile from the build-owned tsconfig (see `sanityFederationTypes`), not
      // the app's. `abortOnError: false` keeps generation from failing the build.
      generateTypes: {abortOnError: false, tsConfigPath: DTS_TSCONFIG_PATH},
    },
    exposes,
    filename: `${FEDERATION_FILE_NAME}.js`,
    manifest: true,
    name,
    // Resolves the remote entry path relative to the manifest rather than the
    // host origin.
    publicPath: 'auto',
    // @module-federation/vite auto-shares every package.json dependency
    // that exposes an `exports` field. That breaks for workspace packages with
    // subpath-only exports (no `.` entry) like `@sanity/cli-build` and
    // `@sanity/workbench`, because vite tries to resolve them as bare imports
    // and fails. Workbench remotes manage runtime sharing through the host's
    // federation runtime, so we opt out of auto-share entirely.
    shared: {},
  })

  // module-federation delivers its dts plugin as a Promise resolving to an
  // array of plugins; spreading a promise (or an array) yields a junk object,
  // which silently drops the plugin. Recurse through the PluginOption shape so
  // every actual plugin gets scoped.
  const scopeToEnvironment = (option: PluginOption): PluginOption => {
    if (!option) return option
    if (option instanceof Promise) return option.then((resolved) => scopeToEnvironment(resolved))
    if (Array.isArray(option)) return option.map((entry) => scopeToEnvironment(entry))
    return {
      ...option,
      // In dev, MF must run on client — the dev server serves through it.
      // In build, scope to the federation environment to keep the library build clean.
      applyToEnvironment: (env) =>
        env.config.command === 'serve' || env.name === FEDERATION_DIR_NAME,
    } satisfies Plugin
  }

  return mfPlugins.map((plugin: PluginOption) => scopeToEnvironment(plugin))
}

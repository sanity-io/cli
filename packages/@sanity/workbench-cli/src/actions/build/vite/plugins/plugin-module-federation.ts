import {federation as moduleFederation, type ModuleFederationOptions} from '@module-federation/vite'
import {type Plugin, type PluginOption, type Rolldown} from 'vite'

import {FEDERATION_DIR_NAME, FEDERATION_OUTPUT_FILE_NAME} from '../constants.js'

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

function patchRemoteEntryFileName(output: Rolldown.OutputOptions): void {
  const resolveFileName = (
    fileName: Rolldown.OutputOptions['entryFileNames'],
    chunk: Rolldown.PreRenderedChunk,
  ) => {
    if (chunk.name === 'remoteEntry') return FEDERATION_OUTPUT_FILE_NAME
    if (typeof fileName === 'function') return fileName(chunk)
    return fileName ?? 'static/[name]-[hash].js'
  }
  const entryFileNames = output.entryFileNames
  const chunkFileNames = output.chunkFileNames
  output.entryFileNames = (chunk) => resolveFileName(entryFileNames, chunk)
  output.chunkFileNames = (chunk) => resolveFileName(chunkFileNames, chunk)
}

export function sanityModuleFederation({exposes, name}: FederationOptions): PluginOption {
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
    filename: FEDERATION_OUTPUT_FILE_NAME,
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

  // module-federation can deliver a plugin as a Promise resolving to an array;
  // spreading a promise (or an array) yields a junk object that silently drops
  // it. Recurse through the PluginOption shape so every actual plugin gets scoped.
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

  const remoteEntryOutputPlugin: Plugin = {
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === FEDERATION_DIR_NAME,
    async buildApp(builder) {
      const outputs = builder.environments[FEDERATION_DIR_NAME]?.config.build.rolldownOptions.output
      if (outputs) {
        for (const output of Array.isArray(outputs) ? outputs : [outputs]) {
          patchRemoteEntryFileName(output)
        }
      }
    },
    name: 'sanity/module-federation-output',
  }

  return [
    ...mfPlugins.map((plugin: PluginOption) => scopeToEnvironment(plugin)),
    remoteEntryOutputPlugin,
  ]
}

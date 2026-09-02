import {type Plugin} from 'vite'

import {
  resourceBindingsChunkFileName,
  resourceBindingsCodeSplittingGroup,
} from '../../resource-bindings.js'
import {FEDERATION_DIR_NAME} from '../constants.js'

// Keep the resource-bindings module in its own unhashed chunk at the bundle root
// so Brett can rewrite it at deploy. `@module-federation/vite` preserves user
// `codeSplitting` groups (clamped below its own), so this survives the federation
// build. The chunk sizing lives on the group itself (see
// `resourceBindingsCodeSplittingGroup`), so it only affects the bindings module.
const resourceBindingsOutput = {
  chunkFileNames: (chunk: {name: string}) =>
    resourceBindingsChunkFileName(chunk.name) ?? 'static/[name]-[hash].js',
  codeSplitting: {
    groups: [resourceBindingsCodeSplittingGroup],
  },
}

interface EnvironmentOptions {
  input: string

  /**
   * When set, also build a standalone `client` SPA environment (its own
   * `index.html` + bootstrap) alongside the federation remote, from this entry.
   * Set for every federated app and studio; omitted only for a dock-only app.
   */
  clientInput?: string

  /** Blueprints build (via `@sanity/runtime-cli`) — emit the resource-bindings module. */
  isBlueprints?: boolean
}

export function sanityEnvironmentPlugin(options: EnvironmentOptions): Plugin {
  const {clientInput, input, isBlueprints} = options

  // Blueprints only: force the resource-bindings module into its own unhashed
  // chunk so Brett can rewrite it at deploy. Off Blueprints, no such chunk.
  const output = isBlueprints ? resourceBindingsOutput : undefined

  return {
    config() {
      return {
        builder: {
          async buildApp(builder) {
            // `emptyOutDir` is false on both environments and the CLI clears
            // `dist` once up-front, so the SPA and federation outputs coexist
            // without either build wiping the other's files.
            if (clientInput) {
              await builder.build(builder.environments.client)
            }
            await builder.build(builder.environments[FEDERATION_DIR_NAME])
          },
        },
        environments: {
          ...(clientInput
            ? {
                client: {
                  build: {
                    assetsDir: 'static',
                    copyPublicDir: false,
                    emptyOutDir: false,
                    outDir: `dist`,
                    rolldownOptions: {
                      input: {sanity: clientInput},
                      output,
                    },
                  },
                  consumer: 'client',
                },
              }
            : {}),
          [FEDERATION_DIR_NAME]: {
            build: {
              assetsDir: 'static',
              copyPublicDir: false,
              emptyOutDir: false,
              outDir: `dist`,
              rolldownOptions: {input, output},
            },
            consumer: 'client',
          },
        },
      }
    },
    name: 'sanity/environment',
  }
}

import {type Plugin} from 'vite'

import {FEDERATION_DIR_NAME} from '../constants.js'

interface EnvironmentOptions {
  input: string

  /**
   * When set, also build a standalone `client` SPA environment (its own
   * `index.html` + bootstrap) alongside the federation remote, from this entry.
   * Omitted for a dock-only app or when the workbench-remote SPA is disabled.
   */
  clientInput?: string
}

export function sanityEnvironmentPlugin(options: EnvironmentOptions): Plugin {
  const {clientInput, input} = options

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
                    rolldownOptions: {input: {sanity: clientInput}},
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
              rolldownOptions: {input},
            },
            consumer: 'client',
          },
        },
      }
    },
    name: 'sanity/environment',
  }
}

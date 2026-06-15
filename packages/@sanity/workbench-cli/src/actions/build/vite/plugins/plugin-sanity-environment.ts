import {type Plugin} from 'vite'

import {FEDERATION_DIR_NAME} from '../constants.js'

interface EnvironmentOptions {
  input: string
}

export function sanityEnvironmentPlugin(options: EnvironmentOptions): Plugin {
  return {
    config() {
      return {
        builder: {
          async buildApp(builder) {
            await builder.build(builder.environments[FEDERATION_DIR_NAME])
          },
        },
        environments: {
          [FEDERATION_DIR_NAME]: {
            build: {
              copyPublicDir: false,
              outDir: `dist`,
              rollupOptions: {input: options.input},
            },
            consumer: 'client',
          },
        },
      }
    },
    name: 'sanity/environment',
  }
}

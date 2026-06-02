import {CliConfig} from '@sanity/cli-core'
import viteReact from '@vitejs/plugin-react'
import {Plugin} from 'vite'

export function viteReactPluginFactory(reactCompiler: CliConfig['reactCompiler']): () => Plugin[] {
  return () =>
    viteReact(
      reactCompiler
        ? {
            babel: {
              generatorOpts: {compact: true},
              plugins: [['babel-plugin-react-compiler', reactCompiler]],
            },
          }
        : {},
    )
}

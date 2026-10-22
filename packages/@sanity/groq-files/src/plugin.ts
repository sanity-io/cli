import {readFileSync} from 'node:fs'

import {createUnplugin} from 'unplugin'

import {createRuntimeModule} from './runtime.js'

const GROQ_FILE = /\.groq(?:\?.*)?$/

/**
 * Vite and Rollup accept any plugin object with a `name`.
 */
export type GroqRollupPlugin = {name: string}

/**
 * The shape esbuild's `Plugin` requires. The parameter is left open so this declaration does not
 * depend on esbuild's types.
 */
export type GroqEsbuildPlugin = {
  name: string
  setup(build: unknown): Promise<void> | void
}

/**
 * The shape webpack's and rspack's plugin instances require, same reasoning as esbuild.
 */
export type GroqWebpackPlugin = {
  apply(compiler: unknown): void
}

/**
 * Bundler plugins. The default import of a `.groq` file evaluates to the query string. Types
 * come from the content mapper or a generated `*.d.groq.ts`, not from here.
 *
 * Each factory is typed as the minimal plugin shape its bundler accepts. unplugin's own types
 * reach into optional peer packages (`@rspack/core`, `webpack`) that this package does not
 * declare, so they are not exposed.
 */
export interface GroqFilesPlugin {
  esbuild: () => GroqEsbuildPlugin
  rollup: () => GroqRollupPlugin
  rspack: () => GroqWebpackPlugin
  vite: () => GroqRollupPlugin
  webpack: () => GroqWebpackPlugin
}

const unplugin = createUnplugin<undefined, false>(() => ({
  load: {
    filter: {id: GROQ_FILE},
    handler(id) {
      return createRuntimeModule(readFileSync(filePath(id), 'utf8'))
    },
  },
  name: '@sanity/groq-files',
}))

export const groqFilesPlugin: GroqFilesPlugin = {
  esbuild: unplugin.esbuild,
  rollup: unplugin.rollup,
  rspack: unplugin.rspack,
  vite: unplugin.vite,
  webpack: unplugin.webpack,
}

function filePath(id: string): string {
  const path = id.split('\0').pop() ?? id
  return path.split('?')[0] ?? path
}

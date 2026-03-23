/* eslint-disable import-x/no-extraneous-dependencies -- build tooling, not runtime */
import {createRequire} from 'node:module'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import alias from '@rollup/plugin-alias'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import {nodeResolve} from '@rollup/plugin-node-resolve'
import {defineConfig} from 'rollup'
import esbuildPlugin from 'rollup-plugin-esbuild'
import {visualizer} from 'rollup-plugin-visualizer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cliCoreSrc = path.resolve(__dirname, '../@sanity/cli-core/src')

// debug's index.js conditionally requires both browser.js and node.js at runtime.
// The commonjs plugin bundles both. Alias to the node entry directly.
const require = createRequire(import.meta.url)
const debugNodeEntry = require.resolve('debug/src/node.js')

export default defineConfig({
  external: (id) => id.startsWith('node:'),
  input: 'src/index.ts',
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY') return
    warn(warning)
  },
  output: {
    banner: '#!/usr/bin/env node',
    file: 'dist/index.js',
    format: 'esm',
    inlineDynamicImports: true,
  },
  plugins: [
    alias({
      entries: [
        // Resolve subpaths first (more specific matches before less specific)
        {
          find: '@sanity/cli-core/ux',
          replacement: path.join(cliCoreSrc, '_exports/ux.ts'),
        },
        {
          find: '@sanity/cli-core/package-manager',
          replacement: path.join(cliCoreSrc, '_exports/package-manager.ts'),
        },
        {
          find: '@sanity/cli-core/request',
          replacement: path.join(cliCoreSrc, '_exports/request.ts'),
        },
        // Main barrel - use exact match to avoid catching subpath imports
        {
          find: /^@sanity\/cli-core$/,
          replacement: path.join(cliCoreSrc, 'index.ts'),
        },
        // debug's index.js bundles both browser and node via conditional require.
        // Alias to node entry directly since this is a Node CLI tool.
        {find: 'debug', replacement: debugNodeEntry},
      ],
    }),
    nodeResolve({
      // Don't resolve the legacy "browser" field in package.json.
      // Without this, packages like `debug` resolve to their browser bundle.
      browser: false,
      exportConditions: ['node', 'import', 'default'],
      preferBuiltins: true,
    }),
    commonjs(),
    json(),
    esbuildPlugin({
      // Keep readable output so sourcemaps line up for source-map-explorer
      minify: false,
      target: 'node20',
    }),
    // Shorten pnpm store paths in module IDs so the treemap is readable.
    // `.pnpm/pkg@1.0.0/node_modules/pkg/dist/foo.js` → `pkg/dist/foo.js`
    {
      generateBundle(_options, bundle) {
        // The visualizer reads from the chunk's `modules` object keys
        for (const chunk of Object.values(bundle)) {
          if (chunk.type !== 'chunk' || !chunk.modules) continue
          const cleaned: Record<string, (typeof chunk.modules)[string]> = {}
          for (const [id, info] of Object.entries(chunk.modules)) {
            const short = id.replace(/.*\.pnpm\/[^/]+\/node_modules\//, '')
            cleaned[short] = info
          }
          chunk.modules = cleaned
        }
      },
      name: 'clean-module-ids',
    },
    visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      template: 'treemap',
    }),
  ],
  treeshake: {
    // The aliased @sanity/cli-core source has sideEffects: false in its package.json,
    // but since we alias to raw source files, Rollup doesn't see the annotation.
    // Mark the entire cli-core source tree as side-effect-free for proper tree-shaking.
    moduleSideEffects: (id) => {
      if (id.includes('/cli-core/src/')) return false
      return true
    },
  },
})

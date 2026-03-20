import {defineConfig} from 'rolldown'
import {visualizer} from 'rollup-plugin-visualizer'

export default defineConfig({
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'esm',
    banner: '#!/usr/bin/env node',
  },
  platform: 'node',
  plugins: [
    visualizer({
      filename: 'dist/stats.html',
      template: 'treemap',
    }),
  ],
})

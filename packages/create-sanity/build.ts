import {build} from 'esbuild'
import {writeFile} from 'node:fs/promises'

const result = await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  banner: {js: '#!/usr/bin/env node'},
  // Bundle everything - zero runtime deps
  packages: 'bundle',
  treeShaking: true,
  metafile: true,
  logLevel: 'info',
})

// Write metafile for analysis with https://esbuild.github.io/analyze/
await writeFile('dist/meta.json', JSON.stringify(result.metafile))

import {build} from 'esbuild'
import {writeFile} from 'node:fs/promises'

const result = await build({
  // These are pulled in through barrel imports but never used by the init flow.
  // Replace with empty modules to keep the bundle lean.
  alias: {
    // Pulled in via @sanity/cli-core barrel → importModule
    '@rexxars/jiti': './src/stubs/empty.js',
    // Pulled in via @sanity/cli-core barrel → mockBrowserEnvironment
    jsdom: './src/stubs/empty.js',
    // Pulled in via @oclif/core barrel → config → ts-path
    tslib: './src/stubs/empty.js',
    // Pulled in via @oclif/core barrel → config → read-tsconfig
    typescript: './src/stubs/empty.js',
  },
  banner: {js: '#!/usr/bin/env node'},
  bundle: true,
  // Ensure we get Node versions of packages, not browser
  conditions: ['node', 'import', 'default'],
  entryPoints: ['src/index.ts'],
  format: 'esm',
  logLevel: 'info',
  metafile: true,
  outfile: 'dist/index.js',
  packages: 'bundle',
  platform: 'node',
  target: 'node20',
  treeShaking: true,
})

await writeFile('dist/meta.json', JSON.stringify(result.metafile))

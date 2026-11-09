import {extname} from 'node:path'

import {doImport} from '@sanity/cli-core'
import {runnerImport} from 'vite'

const scriptPath = process.argv[2]
const scriptArguments = process.argv.slice(3)

if (!scriptPath) {
  throw new Error('No script path provided')
}

// Make process.argv match direct Node script execution rather than exposing this worker.
process.argv = [process.argv[0], scriptPath, ...scriptArguments]

// Vite's module runner evaluates modules as ESM, which makes `require` calls in CommonJS scripts
// fail with ERR_AMBIGUOUS_MODULE_SYNTAX. Node loads `.cjs` files natively.
await (extname(scriptPath) === '.cjs'
  ? doImport(scriptPath)
  : runnerImport(scriptPath, {
      logLevel: 'error',
      resolve: {tsconfigPaths: true},
      root: process.env.SANITY_BASE_PATH || process.cwd(),
    }))

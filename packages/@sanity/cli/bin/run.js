#!/usr/bin/env node

import {execute} from '@oclif/core'
import {existsSync} from 'node:fs'
import {join as joinPath} from 'node:path'

/**
 * To make it easy to run the CLI in development mode (without needing to compile),
 * we check if the `oclif.manifest.json` file exists in the root of the package.
 *
 * If present, we can assume it is a production build, and execute in production mode.
 * If not present, we use a loader to strip types and execute the CLI in dev mode.
 */
const isProduction = (() => {
  try {
    return existsSync(joinPath(import.meta.dirname, '..', 'oclif.manifest.json'))
  } catch {
    return false
  }
})()

if (isProduction) {
  await execute({dir: import.meta.url})
} else {
  import('./dev.js')
}

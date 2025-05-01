import {existsSync} from 'node:fs'
import {dirname, join as joinPath} from 'node:path'
import {fileURLToPath} from 'node:url'

import debugIt from 'debug'

const debug = debugIt('sanity:cli')
const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * To make it easy to run the CLI in development mode (without needing to compile),
 * we check if the `oclif.manifest.json` file exists in the root of the package.
 *
 * If present, we can assume it is a production build, and execute in production mode.
 * If not present, we use a loader to strip types and execute the CLI in dev mode.
 */
const isProduction = (() => {
  try {
    return existsSync(joinPath(__dirname, '..', 'oclif.manifest.json'))
  } catch {
    return false
  }
})()

if (!isProduction) {
  debug('Running in development mode - registering typescript loader')
  import('ts-blank-space/register')
}

export default {
  bin: 'sanity',
  commands: isProduction ? './dist/commands' : './src/commands',
  dirname: 'sanity',
  plugins: ['@oclif/plugin-help'],
  topicSeparator: ' ',
}

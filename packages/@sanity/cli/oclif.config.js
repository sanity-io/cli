// @ts-check
import {existsSync} from 'node:fs'
import {URL} from 'node:url'

import debugIt from 'debug'

const debug = debugIt('sanity:cli')

/**
 * To make it easy to run the CLI in development mode (without needing to compile),
 * we check if the `isDev` file exists in the root of the package.
 *
 * This is a temp file created before running the watch command and removed after
 * the watch command is done.
 *
 * If present, we use a loader to strip types and execute the CLI in dev mode.
 */
const isDevelopment = (() => {
  try {
    return existsSync(new URL('isDev', import.meta.url))
  } catch {
    return false
  }
})()

if (isDevelopment) {
  debug('Running in development mode - registering typescript loader')
  import('ts-blank-space/register')
}

export default {
  bin: 'sanity',
  commands: isDevelopment ? './src/commands' : './dist/commands',
  dirname: 'sanity',
  plugins: ['@oclif/plugin-help', '@oclif/plugin-not-found'],
  topicSeparator: ' ',
}

import {type Command} from '@oclif/core'

interface BuildStudioOptions {
  log: Command['log']
}

/**
 * Build the Sanity Studio.
 *
 * @internal
 */
export function buildStudio(options: BuildStudioOptions) {
  const {log} = options

  log('Building studio...')
}

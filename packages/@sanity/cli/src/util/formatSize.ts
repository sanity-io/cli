import {chalk} from '@sanity/cli-core/ux'

/**
 * Formats bytes to kB
 *
 * @internal
 */
export function formatSize(bytes: number): string {
  return chalk.cyan(`${(bytes / 1024).toFixed(0)} kB`)
}

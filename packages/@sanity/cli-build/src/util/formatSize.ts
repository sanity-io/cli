import {styleText} from 'node:util'

/**
 * Formats bytes to kB
 *
 * @internal
 */
export function formatSize(bytes: number): string {
  return styleText('cyan', `${(bytes / 1024).toFixed(0)} kB`)
}

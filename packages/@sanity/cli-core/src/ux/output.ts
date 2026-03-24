/* eslint-disable no-console -- these are intentional output helpers */

/**
 * Write a message to stdout. Equivalent to `console.log`.
 *
 * Prefer this over `process.stdout.write` since console.log
 * handles buffering correctly and won't silently drop output
 * if the process exits before the write buffer flushes.
 */
export function stdout(...args: Parameters<typeof console.log>): void {
  console.log(...args)
}

/**
 * Write a message to stderr. Equivalent to `console.error`.
 */
export function stderr(...args: Parameters<typeof console.error>): void {
  console.error(...args)
}

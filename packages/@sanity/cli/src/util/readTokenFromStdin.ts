import {text} from 'node:stream/consumers'

/**
 * Read a secret token from standard input. Reading from stdin keeps the
 * secret out of shell history, process lists, and terminal logs.
 * @param usageHint - Error message shown when stdin is a TTY (i.e. nothing
 * was piped in)
 * @returns The piped input, trimmed
 *
 * @internal
 */
export async function readTokenFromStdin(usageHint: string): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error(usageHint)
  }

  return (await text(process.stdin)).trim()
}

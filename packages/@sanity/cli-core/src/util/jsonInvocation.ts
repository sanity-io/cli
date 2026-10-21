type FlagDefinitions = Record<string, {char?: string; type?: string} | undefined>

/**
 * Walks argv the way oclif's parser would: stopping at `--`, honouring the
 * `--json` long form, and recognizing a short alias inside a bundle such as
 * `-yj`. A token following an option flag is skipped, so a parse that fails on
 * `--name -j` is not read as a request for JSON.
 *
 * `--json=<value>` counts regardless of the value. oclif discards the `=` part
 * for a boolean flag.
 */
export function hasJsonFlagInArgv(argv: string[], definitions: FlagDefinitions): boolean {
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--') break

    if (argument.startsWith('--')) {
      if (argument === '--json' || argument.startsWith('--json=')) return true
      if (!argument.includes('=') && definitions[argument.slice(2)]?.type === 'option') index++
      continue
    }

    if (!argument.startsWith('-')) continue

    // oclif splits alphabetic short flag bundles left to right, so scan until a
    // character is either unknown or consumes the rest of the token as a value.
    const characters = argument.slice(1)
    for (let offset = 0; offset < characters.length; offset++) {
      const flag = Object.entries(definitions).find(
        ([, value]) => value?.char === characters[offset],
      )
      if (!flag) break
      if (flag[0] === 'json') return true
      if (flag[1]?.type === 'option') {
        if (offset === characters.length - 1) index++
        break
      }
    }
  }

  return false
}

const RELAYED_ERROR_PROPERTIES = ['code', 'oclif', 'statusCode', 'suggestions'] as const

/**
 * A subset of oclif's own error JSON, so the shape stays compatible
 * with what the same command prints on the command line.
 */
export function toRelayableErrorJson(err: unknown): {error: unknown} {
  if (!(err instanceof Error)) return {error: err}

  const source = err as Error & Record<string, unknown>
  const error: Record<string, unknown> = {message: err.message, name: err.name}
  for (const key of RELAYED_ERROR_PROPERTIES) {
    if (source[key] !== undefined) error[key] = source[key]
  }

  return {error}
}

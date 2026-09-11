/**
 * Parsed `--aspect` values, or the message explaining which occurrence was
 * malformed. Returned rather than thrown so the caller decides the exit code.
 */
type ParseAspectFlagsResult = {aspects: Record<string, string>} | {error: string}

/**
 * Assemble repeated `--aspect key=value` flags into the aspects object the
 * media library ingest endpoint accepts.
 *
 * Values stay strings: the CLI has no access to the aspect definitions, so
 * coercing `42` or `true` would guess at the target field's type. Aspects
 * needing non-string or nested values belong in the `data.ndjson` of a
 * directory import.
 *
 * Later occurrences of a key win, matching how `--header` and the NDJSON
 * aspect index resolve duplicates.
 *
 * @internal
 */
export function parseAspectFlags(aspectFlags: readonly string[]): ParseAspectFlagsResult {
  // Null-prototype so an aspect named e.g. `constructor` cannot reach Object.prototype
  const aspects: Record<string, string> = Object.create(null)

  for (const aspect of aspectFlags) {
    const separatorIndex = aspect.indexOf('=')
    if (separatorIndex < 1) {
      return {error: `Invalid --aspect "${aspect}": expected key=value format`}
    }
    aspects[aspect.slice(0, separatorIndex).trim()] = aspect.slice(separatorIndex + 1)
  }

  return {aspects}
}

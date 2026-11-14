import {chmodSync, writeFileSync} from 'node:fs'

/**
 * Serialize the given `data` as JSON and write it synchronously to the given path.
 *
 * @param filePath - Path to JSON file to write
 * @param options - `mode` sets the file mode, both for new files and for files that already exist
 * @internal
 */
export function writeJsonFileSync(
  filePath: string,
  data: unknown,
  options: {mode?: number; pretty?: boolean} = {},
): void {
  const {mode, pretty = false} = options
  try {
    const stringified = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
    writeFileSync(
      filePath,
      `${stringified}\n`,
      mode === undefined ? 'utf8' : {encoding: 'utf8', mode},
    )
    // `writeFileSync` only applies `mode` when it creates the file
    if (mode !== undefined) chmodSync(filePath, mode)
  } catch (err: unknown) {
    throw new Error(`Failed to write "${filePath}"`, {cause: err})
  }
}

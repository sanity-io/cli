import {writeFileSync} from 'node:fs'

/**
 * Serialize the given `data` as JSON and write it synchronously to the given path.
 *
 * @param filePath - Path to JSON file to write
 * @internal
 */
export function writeJsonFileSync(
  filePath: string,
  data: unknown,
  options: {pretty?: boolean} = {},
): void {
  const {pretty = false} = options
  try {
    const stringified = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
    writeFileSync(filePath, stringified, 'utf8')
  } catch (err: unknown) {
    throw new Error(`Failed to write "${filePath}"`, {cause: err})
  }
}

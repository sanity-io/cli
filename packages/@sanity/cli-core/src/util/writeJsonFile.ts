import {writeFile} from 'node:fs/promises'

/**
 * Serialize the given `data` as JSON and write it to the given path.
 *
 * @param filePath - Path to JSON file to read
 * @internal
 */
export async function writeJsonFile(
  filePath: string,
  data: unknown,
  options: {pretty?: boolean} = {},
): Promise<void> {
  const {pretty = false} = options
  try {
    const stringified = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
    await writeFile(filePath, stringified, 'utf8')
  } catch (err: unknown) {
    throw new Error(`Failed to write "${filePath}"`, {cause: err})
  }
}

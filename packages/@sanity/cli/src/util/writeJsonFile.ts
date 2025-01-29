import {writeFile} from 'node:fs/promises'

/**
 * Serialize the given `data` as JSON and write it to the given path.
 *
 * @param filePath - Path to JSON file to read
 * @internal
 */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  try {
    await writeFile(filePath, JSON.stringify(data), 'utf8')
  } catch (err: unknown) {
    throw new Error(`Failed to write "${filePath}"`, {cause: err})
  }
}

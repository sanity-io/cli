import {readFile} from 'node:fs/promises'

type JSONValue = boolean | JSONArray | JSONObject | number | string | null

type JSONObject = {[key: string]: JSONValue}

type JSONArray = Array<JSONValue>

/**
 * Read the file at the given path and parse it as JSON.
 *
 * @param filePath - Path to JSON file to read
 * @returns The parsed file
 * @internal
 */
export async function readJsonFile(filePath: string): Promise<JSONValue> {
  let content: string
  try {
    content = await readFile(filePath, 'utf8')
  } catch (err: unknown) {
    throw new Error(`Failed to read "${filePath}"`, {cause: err})
  }

  try {
    return JSON.parse(content)
  } catch (err: unknown) {
    throw new Error(`Failed to parse "${filePath}" as JSON`, {cause: err})
  }
}

import {readFile} from 'node:fs/promises'

/**
 * Reads and parses an NDJSON (newline-delimited JSON) file containing telemetry events.
 *
 * @param filePath - Path to the NDJSON file
 * @returns Promise resolving to array of parsed telemetry events
 * @throws Error if file cannot be read or contains invalid JSON
 *
 * @internal
 */
export async function readNDJSON<T>(filePath: string): Promise<T[]> {
  const content = await readFile(filePath, 'utf8')

  if (!content.trim()) {
    return []
  }

  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

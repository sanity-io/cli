import {readFile} from 'node:fs/promises'

import {telemetryStoreDebug} from './telemetryStoreDebug.js'

/**
 * Reads and parses an NDJSON (newline-delimited JSON) file containing telemetry events.
 * Malformed lines are skipped individually rather than failing the entire file.
 *
 * @param filePath - Path to the NDJSON file
 * @returns Promise resolving to array of parsed telemetry events
 *
 * @internal
 */
export async function readNDJSON<T>(filePath: string): Promise<T[]> {
  const content = await readFile(filePath, 'utf8')

  if (!content.trim()) {
    return []
  }

  const results: T[] = []
  for (const line of content.trim().split('\n')) {
    if (!line) continue
    try {
      results.push(JSON.parse(line) as T)
    } catch {
      telemetryStoreDebug('Skipping malformed JSON line in %s: %s', filePath, line.slice(0, 100))
    }
  }
  return results
}

import {join} from 'node:path'

import {getTelemetryBaseInfo, normalizePath} from '@sanity/cli-core'
import {glob} from 'tinyglobby'

import {telemetryStoreDebug} from './telemetryStoreDebug.js'

/**
 * Discovers and returns paths to all telemetry files for the current user/environment.
 *
 * This function is used during:
 * - Flush operations: to collect and send events from all CLI sessions
 * - Cleanup operations: to find old files that should be removed
 *
 * Uses glob patterns to match files across all sessions (not just the current one).
 *
 * @returns Promise resolving to array of file paths, empty if no files exist
 * @internal
 */
export async function findTelemetryFiles(): Promise<string[]> {
  try {
    const {basePattern, directory} = await getTelemetryBaseInfo()
    const pattern = `${basePattern}-*.ndjson`
    const fullPattern = join(directory, pattern)
    telemetryStoreDebug('Looking for files matching pattern: %s', fullPattern)

    // Converts windows backslashes to forward slashes for glob pattern
    const matchingFiles = await glob(normalizePath(fullPattern))
    telemetryStoreDebug('Found %d matching telemetry files', matchingFiles.length)
    return matchingFiles
  } catch (error) {
    if ((error as {code?: string}).code === 'ENOENT') {
      telemetryStoreDebug('Telemetry directory does not exist yet')
      return []
    }
    throw error
  }
}

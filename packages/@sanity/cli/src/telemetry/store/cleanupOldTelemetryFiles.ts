import {rm, stat} from 'node:fs/promises'

import {telemetryStoreDebug} from './debug.js'
import {findTelemetryFiles} from './findTelemetryFiles.js'

/**
 * Cleans up telemetry files older than the specified number of days
 * @internal
 */
export async function cleanupOldTelemetryFiles(maxAgeDays: number = 7): Promise<void> {
  try {
    const files = await findTelemetryFiles()
    const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

    for (const filePath of files) {
      try {
        const stats = await stat(filePath)
        if (stats.mtime.getTime() < cutoffTime) {
          telemetryStoreDebug('Cleaning up old telemetry file: %s', filePath)
          await rm(filePath, {force: true})
        }
      } catch (error) {
        telemetryStoreDebug('Error checking/removing old file %s: %o', filePath, error)
      }
    }
  } catch (error) {
    telemetryStoreDebug('Error during cleanup: %o', error)
    // Don't throw - cleanup is best effort
  }
}

import {join} from 'node:path'

import {telemetryStoreDebug} from './debug.js'
import {getTelemetryBaseInfo} from './getTelemetryBaseInfo.js'

/**
 * Generates a unique telemetry file path for a specific CLI session.
 *
 * File format: `telemetry-\{hashedToken\}-\{env\}-\{sessionId\}.ndjson`
 *
 * The sessionId ensures each CLI process writes to its own file, preventing:
 * - File write conflicts when multiple CLI commands run concurrently
 * - Race conditions during file operations
 * - Data corruption from simultaneous writes
 *
 * During flush, all session files are discovered and aggregated together.
 *
 * @param sessionId - Unique identifier for this CLI session
 * @returns Promise resolving to the full file path for this session's telemetry
 * @internal
 */
export async function generateTelemetryFilePath(sessionId: string): Promise<string> {
  telemetryStoreDebug('Generating telemetry file path for sessionId: %s', sessionId)

  const {basePattern, directory, environment, hashedToken} = await getTelemetryBaseInfo()

  telemetryStoreDebug('Generated token hash: %s', hashedToken)
  telemetryStoreDebug('Detected environment: %s', environment)

  const fileName = `${basePattern}-${sessionId}.ndjson`
  const filePath = join(directory, fileName)
  telemetryStoreDebug('Telemetry file path: %s', filePath)

  return filePath
}

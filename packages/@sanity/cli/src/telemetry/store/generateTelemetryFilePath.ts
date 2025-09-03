import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {getCliToken} from '@sanity/cli-core'

import {telemetryStoreDebug} from './debug.js'

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

  const token = await getCliToken()
  if (!token) {
    telemetryStoreDebug('No auth token found - user must be logged in for telemetry')
    throw new Error('No auth token found - user must be logged in for telemetry')
  }

  // Hash token for privacy (first 8 chars of SHA256)
  const hashedToken = createHash('sha256').update(token).digest('hex').slice(0, 8)
  telemetryStoreDebug('Generated token hash: %s', hashedToken)

  // Detect environment
  const isStaging = process.env.SANITY_STUDIO_API_HOST?.includes('staging') ?? false
  const env = isStaging ? 'staging' : 'production'
  telemetryStoreDebug('Detected environment: %s', env)

  const fileName = `telemetry-${hashedToken}-${env}-${sessionId}.ndjson`
  const filePath = join(homedir(), '.config', 'sanity', fileName)
  telemetryStoreDebug('Telemetry file path: %s', filePath)

  return filePath
}

import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {getCliToken} from '@sanity/cli-core'

import {isStaging} from '../../util/isStaging.js'

/**
 * Base information needed for telemetry file operations.
 * Contains common data used by both file path generation and pattern matching.
 */
export interface TelemetryBaseInfo {
  /** Base filename pattern without sessionId suffix */
  basePattern: string
  /** Base directory where telemetry files are stored */
  directory: string
  /** Environment: 'staging' or 'production' */
  environment: string
  /** Hashed token (first 8 chars of SHA256) for privacy */
  hashedToken: string
}

/**
 * Gets the base telemetry information needed for file operations.
 * 
 * This shared utility extracts common logic used by:
 * - `generateTelemetryFilePath` - for generating session-specific file paths
 * - `findTelemetryFiles` - for discovering all telemetry files via glob patterns
 *
 * @returns Promise resolving to base telemetry information
 * @throws Error if no auth token is found
 * @internal
 */
export async function getTelemetryBaseInfo(): Promise<TelemetryBaseInfo> {
  const token = await getCliToken()
  if (!token) {
    throw new Error('No auth token found - user must be logged in for telemetry')
  }

  const hashedToken = createHash('sha256').update(token).digest('hex').slice(0, 8)
  const environment = isStaging() ? 'staging' : 'production'
  const directory = join(homedir(), '.config', 'sanity')
  const basePattern = `telemetry-${hashedToken}-${environment}`

  return {
    basePattern,
    directory,
    environment,
    hashedToken,
  }
}
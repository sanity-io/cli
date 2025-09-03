import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import {join} from 'node:path'

import {getCliToken} from '@sanity/cli-core'

/**
 * Generates glob patterns to discover ALL telemetry files for the current user and environment.
 *
 * Used during flush operations to find telemetry files across all CLI sessions,
 * as each session writes to its own file but flush needs to aggregate them all.
 *
 * Pattern: `telemetry-\{hashedToken\}-\{env\}-*.ndjson` (matches any sessionId)
 *
 * @returns Object containing directory path and glob pattern for file discovery
 * @internal
 */
export async function getTelemetryFilesPattern(): Promise<{
  basePattern: string
  directory: string
  pattern: string
}> {
  const token = await getCliToken()
  if (!token) {
    throw new Error('No auth token found - user must be logged in for telemetry')
  }

  const hashedToken = createHash('sha256').update(token).digest('hex').slice(0, 8)
  const isStaging = process.env.SANITY_STUDIO_API_HOST?.includes('staging') ?? false
  const env = isStaging ? 'staging' : 'production'

  const directory = join(homedir(), '.config', 'sanity')
  const basePattern = `telemetry-${hashedToken}-${env}`
  const pattern = `${basePattern}-*.ndjson`

  return {basePattern, directory, pattern}
}

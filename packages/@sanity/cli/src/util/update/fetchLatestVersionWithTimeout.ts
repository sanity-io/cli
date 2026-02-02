import {subdebug} from '@sanity/cli-core'
import getLatestVersion from 'get-latest-version'

const debug = subdebug('updateChecker')

/**
 * Fetch the latest version from npm with a timeout
 */
export async function fetchLatestVersionWithTimeout(
  packageName: string,
  timeout: number,
): Promise<string | null | undefined> {
  try {
    const result = await Promise.race([
      getLatestVersion(packageName),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeout)),
    ])

    if (result === null) {
      debug('Max time (%dms) reached waiting for latest version info', timeout)
    }

    return result
  } catch (err) {
    debug(
      `Failed to fetch latest version of ${packageName} from npm:\n${err instanceof Error ? err.stack : String(err)}`,
    )
    return undefined
  }
}

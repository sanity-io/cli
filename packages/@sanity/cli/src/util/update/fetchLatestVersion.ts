import {subdebug} from '@sanity/cli-core'
import getLatestVersion from 'get-latest-version'

import {promiseRaceWithTimeout} from '../promiseRaceWithTimeout.js'

const debug = subdebug('updateChecker')

/**
 * Fetch the latest version from npm with a timeout
 */
export async function fetchLatestVersion(
  packageName: string,
  timeout: number,
): Promise<string | null | undefined> {
  try {
    const result = await promiseRaceWithTimeout(getLatestVersion(packageName), timeout)

    if (result === null) {
      debug(`Max time ${timeout} reached waiting for latest version info`)
    }

    debug('Latest remote version is %s', result)

    return result
  } catch (err) {
    debug(
      `Failed to fetch latest version of ${packageName} from npm:\n${err instanceof Error ? err.stack : String(err)}`,
    )
    throw err
  }
}

import {getUserConfig, subdebug} from '@sanity/cli-core'
import {getLatestVersion} from 'get-latest-version'

import {promiseRaceWithTimeout} from '../promiseRaceWithTimeout.js'
import {resolveUpdateTarget} from './resolveUpdateTarget.js'

const debug = subdebug('updateChecker')

const FETCH_TIMEOUT = 15_000

/**
 * Fetch the latest version of the update target package and write it to the config cache.
 * Designed to run in a detached child process so it never blocks the main CLI.
 */
export async function runFetchWorker(cwd: string, cliVersion: string): Promise<void> {
  const {packageName} = await resolveUpdateTarget(cwd, cliVersion)
  debug('Worker: fetching latest version of %s', packageName)

  let latestVersion: string | null | undefined
  try {
    latestVersion = await promiseRaceWithTimeout(getLatestVersion(packageName), FETCH_TIMEOUT)
  } catch (err) {
    debug(
      'Worker: failed to fetch latest version of %s from npm: %s',
      packageName,
      err instanceof Error ? err.message : String(err),
    )
    throw err
  }

  if (latestVersion === null) {
    debug('Worker: fetch timed out after %dms', FETCH_TIMEOUT)
    return
  }

  debug('Worker: latest %s version is %s', packageName, latestVersion)

  const store = getUserConfig()
  const cacheKey = `latestVersion:${packageName}`

  store.set(cacheKey, {
    updatedAt: Date.now(),
    value: latestVersion,
  })

  debug('Worker: cached result to %s', cacheKey)
}

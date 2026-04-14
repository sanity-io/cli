import {getUserConfig, isCi, subdebug} from '@sanity/cli-core'
import semver from 'semver'

import {createExpiringConfig} from '../createExpiringConfig.js'
import {fetchLatestVersion} from './fetchLatestVersion.js'
import {resolveUpdateTarget} from './resolveUpdateTarget.js'
import {showUpdateNotification} from './showNotificationUpdate.js'

const debug = subdebug('updateChecker')

const TWELVE_HOURS = 12 * 60 * 60 * 1000 // 12 hours
const CHECK_TIMEOUT = 300

/**
 * Check for CLI updates and notify the user if a new version is available.
 * This is designed to be non-blocking and will silently fail if anything goes wrong.
 *
 * @param config - The CLI config containing version and name
 */
export async function updateChecker(config: {version: string}): Promise<void> {
  debug(`Installed CLI version is ${config.version}`)
  // Skip in CI or if disabled
  if (isCi() || process.env.NO_UPDATE_NOTIFIER) {
    debug('Running on CI, or explicitly disabled, skipping update check')
    return
  }

  if (!process.stdout.isTTY) {
    return
  }

  // Resolve which package to check and what's installed locally.
  // If the project depends on `sanity`, check that; otherwise fall back to `@sanity/cli`.
  const {installedVersion, packageName} = await resolveUpdateTarget(process.cwd(), config.version)
  debug('Update target: %s@%s', packageName, installedVersion)

  const store = getUserConfig()

  let showNotificationUpdate = true

  // Cache for latest version from npm
  const latestVersionCache = createExpiringConfig({
    fetchValue: async () => fetchLatestVersion(packageName, CHECK_TIMEOUT),
    key: `latestVersion:${packageName}`,
    onCacheHit: () => {
      debug('Less than 12 hours since last check, skipping update check')
      showNotificationUpdate = false
    },
    onFetch: () => debug('Checking for latest remote version of %s', packageName),
    store,
    ttl: TWELVE_HOURS,
    validateValue: (value): value is string => typeof value === 'string',
  })

  const latestVersion = await latestVersionCache.get()

  if (!latestVersion) {
    debug('No cached latest version result found')
    return
  }

  const comparison = semver.compare(latestVersion, installedVersion)

  if (comparison < 0) {
    debug('Remote version older than local')
    return
  }

  if (comparison === 0) {
    debug('No update found')
    return
  }

  debug('Update is available (%s)', latestVersion)

  if (showNotificationUpdate) {
    await showUpdateNotification(installedVersion, latestVersion, packageName)
  }
}

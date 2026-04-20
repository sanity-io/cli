import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

import {getUserConfig, isCi, subdebug} from '@sanity/cli-core'
import {gt as semverGt} from 'semver'

import {resolveUpdateTarget} from './resolveUpdateTarget.js'
import {showUpdateNotification} from './showNotificationUpdate.js'

const debug = subdebug('updateChecker')

const TWELVE_HOURS = 12 * 60 * 60 * 1000

/**
 * Check for CLI updates and notify the user if a new version is available.
 *
 * The main process resolves the local update target (which package and installed version),
 * then reads the latest version from the config cache. It never makes network requests.
 * If the cache is empty or expired, a detached worker process is spawned to fetch the
 * latest version from npm and write it to the cache. The notification is shown on the
 * next CLI invocation when the cached result is available instantly.
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
  // This walks up from cwd reading package.json files - fast, no network.
  const {installedVersion, packageName} = await resolveUpdateTarget(process.cwd(), config.version)
  debug('Update target: %s@%s', packageName, installedVersion)

  const store = getUserConfig()
  const cacheKey = `latestVersion:${packageName}`
  const cached = readCachedLatestVersion(store, cacheKey)

  if (cached) {
    const {expired, latestVersion} = cached

    debug(
      'Cache %s for %s: installed=%s, latest=%s',
      expired ? 'expired' : 'hit',
      packageName,
      installedVersion,
      latestVersion,
    )

    if (semverGt(latestVersion, installedVersion)) {
      debug('Update is available (%s)', latestVersion)
      await showUpdateNotification(installedVersion, latestVersion, packageName)
    } else {
      debug('No update found')
    }

    if (expired) {
      debug('Cache expired, spawning worker to refresh')
      spawnFetchWorker(config.version)
    }
  } else {
    debug('No cached update info, spawning worker to fetch')
    spawnFetchWorker(config.version)
  }
}

/**
 * Read and validate the cached latest version for a specific package.
 * The cache only stores the latest npm version (globally valid) - the installed
 * version is always resolved locally to avoid cross-project confusion.
 */
function readCachedLatestVersion(
  store: ReturnType<typeof getUserConfig>,
  cacheKey: string,
): {expired: boolean; latestVersion: string} | null {
  const stored: unknown = store.get(cacheKey)

  if (
    !stored ||
    typeof stored !== 'object' ||
    !('updatedAt' in stored) ||
    typeof stored.updatedAt !== 'number' ||
    !('value' in stored) ||
    typeof stored.value !== 'string'
  ) {
    return null
  }

  const expired = Date.now() - stored.updatedAt > TWELVE_HOURS
  return {expired, latestVersion: stored.value}
}

/**
 * Spawn a detached worker process to fetch the latest version and update the cache.
 * The worker is unref'd so the parent CLI can exit immediately.
 */
function spawnFetchWorker(cliVersion: string): void {
  const workerPath = fileURLToPath(new URL('fetchUpdateInfo.worker.js', import.meta.url))
  debug(`Spawning update check worker: ${process.execPath} ${workerPath}`)

  spawn(process.execPath, [workerPath], {
    detached: true,
    env: {
      ...process.env,
      SANITY_UPDATE_CHECK_CLI_VERSION: cliVersion,
      SANITY_UPDATE_CHECK_CWD: process.cwd(),
    },
    stdio: debug.enabled ? 'inherit' : 'ignore',
  }).unref()
}

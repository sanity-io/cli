import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

import {getUserConfig, isCi, subdebug} from '@sanity/cli-core'
import {gt as semverGt} from 'semver'

import {type SanityPackage} from '../packageManager/installationInfo/types.js'
import {showUpdateNotification} from './showNotificationUpdate.js'

const debug = subdebug('updateChecker')

const TWELVE_HOURS = 12 * 60 * 60 * 1000

interface CachedUpdateInfo {
  installedVersion: string
  latestVersion: string
  packageName: SanityPackage
}

/**
 * Check for CLI updates and notify the user if a new version is available.
 *
 * The main process only reads from the config cache - it never makes network requests.
 * If the cache is empty or expired, a detached worker process is spawned to fetch the
 * latest version from npm and write it to the cache. The notification is shown on the
 * next CLI invocation when the cached result is available instantly.
 */
export async function updateChecker(config: {
  name: string
  root: string
  version: string
}): Promise<void> {
  debug(`Installed CLI version is ${config.version}`)

  // Skip in CI or if disabled
  if (isCi() || process.env.NO_UPDATE_NOTIFIER) {
    debug('Running on CI, or explicitly disabled, skipping update check')
    return
  }

  if (!process.stdout.isTTY) {
    return
  }

  // Skip for temporary npx downloads (npx @sanity/cli when not locally installed).
  // This does NOT skip `npx sanity` resolving to a local install (path is in node_modules/.bin/).
  const binaryPath = process.argv[1] ?? ''
  if (binaryPath.includes('/_npx/') || binaryPath.includes('\\_npx\\')) {
    debug('Running from temporary npx download, skipping update check')
    return
  }

  const store = getUserConfig()

  // Try reading cached update info
  const cached = readCachedUpdateInfo(store)

  if (cached) {
    const {expired, info} = cached

    if (!expired) {
      // Cache is fresh - check if there's an update to show
      debug(
        'Cache hit for %s: installed=%s, latest=%s',
        info.packageName,
        info.installedVersion,
        info.latestVersion,
      )

      if (semverGt(info.latestVersion, info.installedVersion)) {
        debug('Update is available (%s)', info.latestVersion)
        await showUpdateNotification(info.installedVersion, info.latestVersion, info.packageName)
      } else {
        debug('No update found')
      }

      return
    }

    debug('Cache expired, spawning worker to refresh')
  } else {
    debug('No cached update info, spawning worker to fetch')
  }

  // Cache is empty or expired - spawn worker to fetch in background
  spawnFetchWorker(config.version)
}

/**
 * Read and validate cached update info from the config store.
 * Returns the parsed info and whether it's expired, or null if no valid cache exists.
 */
function readCachedUpdateInfo(
  store: ReturnType<typeof getUserConfig>,
): {expired: boolean; info: CachedUpdateInfo} | null {
  // Check both possible cache keys
  for (const key of ['latestVersion:sanity', 'latestVersion:@sanity/cli']) {
    const stored: unknown = store.get(key)

    if (
      !stored ||
      typeof stored !== 'object' ||
      !('updatedAt' in stored) ||
      typeof stored.updatedAt !== 'number' ||
      !('value' in stored) ||
      typeof stored.value !== 'string'
    ) {
      continue
    }

    try {
      const parsed: unknown = JSON.parse(stored.value)

      if (!isCachedUpdateInfo(parsed)) {
        continue
      }

      const expired = Date.now() - stored.updatedAt > TWELVE_HOURS
      return {expired, info: parsed}
    } catch {
      continue
    }
  }

  return null
}

function isCachedUpdateInfo(value: unknown): value is CachedUpdateInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'packageName' in value &&
    typeof value.packageName === 'string' &&
    'installedVersion' in value &&
    typeof value.installedVersion === 'string' &&
    'latestVersion' in value &&
    typeof value.latestVersion === 'string'
  )
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

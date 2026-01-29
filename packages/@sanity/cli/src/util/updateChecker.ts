import {getUserConfig, isCi} from '@sanity/cli-core'
import boxen from 'boxen'
import getLatestVersion from 'get-latest-version'
import semver from 'semver'

interface UpdateCache {
  lastChecked: number
  latestVersion: string

  lastNotified?: number
}

const UPDATE_CHECK_INTERVAL = 12 * 60 * 60 * 1000 // 12 hours
const CHECK_TIMEOUT = 300

// Use standard config store for caching
const store = getUserConfig()

/**
 * Check for CLI updates and notify the user if a new version is available.
 * This is designed to be non-blocking and will silently fail if anything goes wrong.
 *
 * @param config - The CLI config containing version and name
 */
export async function checkForUpdates(config: {name: string; version: string}): Promise<void> {
  // Skip in CI or if disabled
  if (isCi() || process.env.NO_UPDATE_NOTIFIER) {
    return
  }

  const cache = store.get('updateCheck') as UpdateCache | undefined
  const now = Date.now()

  const currentCache: UpdateCache = cache || {lastChecked: 0, latestVersion: ''}

  // Should we fetch new version info?
  const shouldCheck =
    !currentCache.lastChecked || now - currentCache.lastChecked >= UPDATE_CHECK_INTERVAL

  if (shouldCheck) {
    // Fetch with timeout
    const latestVersion = await fetchLatestVersionWithTimeout(config.name, CHECK_TIMEOUT)

    if (latestVersion) {
      currentCache.lastChecked = now
      currentCache.latestVersion = latestVersion
      store.set('updateCheck', currentCache)
    }
  }

  // Should we notify user?
  if (
    currentCache.latestVersion &&
    semver.gt(currentCache.latestVersion, config.version) &&
    shouldNotify(currentCache, now)
  ) {
    showUpdateNotification(config.version, currentCache.latestVersion)
    currentCache.lastNotified = now
    store.set('updateCheck', currentCache)
  }
}

/**
 * Fetch the latest version from npm with a timeout
 */
async function fetchLatestVersionWithTimeout(
  packageName: string,
  timeout: number,
): Promise<string | null | undefined> {
  try {
    return await Promise.race([
      getLatestVersion(packageName),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeout)),
    ])
  } catch {
    return undefined
  }
}

/**
 * Check if we should notify the user about an update
 */
function shouldNotify(cache: UpdateCache, now: number): boolean {
  return !cache.lastNotified || now - cache.lastNotified >= UPDATE_CHECK_INTERVAL
}

/**
 * Show a boxed notification about the available update
 */
function showUpdateNotification(currentVersion: string, latestVersion: string): void {
  const pm = detectPackageManager()
  const command = getUpdateCommand(pm)

  const message = `Update available: ${currentVersion} → ${latestVersion}\n\nRun ${command} to update`

  const boxed = boxen(message, {
    borderColor: 'yellow',
    borderStyle: 'round',
    margin: 1,
    padding: 1,
  })

  process.stderr.write('\n' + boxed + '\n')
}

/**
 * Detect which package manager is being used
 */
function detectPackageManager(): 'npm' | 'pnpm' | 'yarn' {
  const agent = process.env.npm_config_user_agent || ''
  if (agent.includes('pnpm')) return 'pnpm'
  if (agent.includes('yarn')) return 'yarn'
  return 'npm'
}

/**
 * Get the appropriate update command for the package manager
 */
function getUpdateCommand(pm: 'npm' | 'pnpm' | 'yarn'): string {
  const commands = {
    npm: 'npm install -g @sanity/cli',
    pnpm: 'pnpm add -g @sanity/cli',
    yarn: 'yarn global add @sanity/cli',
  }
  return commands[pm]
}

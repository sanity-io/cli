import {getUserConfig, isCi, subdebug} from '@sanity/cli-core'
import {boxen} from '@sanity/cli-core/ux'
import getLatestVersion from 'get-latest-version'
import semver from 'semver'

interface UpdateCache {
  lastChecked: number
  latestVersion: string

  lastNotified?: number
}

const debug = subdebug('updateChecker')

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
export async function checkForUpdates(config: {
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

  const cache = store.get('updateCheck') as UpdateCache | undefined
  const now = Date.now()

  const currentCache: UpdateCache = cache || {lastChecked: 0, latestVersion: ''}
  debug(`Current update cache: ${JSON.stringify(currentCache)}`)

  const shouldCheckLatestVersion =
    !currentCache.lastChecked || now - currentCache.lastChecked >= UPDATE_CHECK_INTERVAL

  if (shouldCheckLatestVersion) {
    debug('Checking for latest remote version')
    const latestVersion = await fetchLatestVersionWithTimeout(config.name, CHECK_TIMEOUT)

    if (latestVersion) {
      debug('Latest remote version is %s', latestVersion)
      currentCache.lastChecked = now
      currentCache.latestVersion = latestVersion
      store.set('updateCheck', currentCache)
    }
  } else {
    debug('Less than 12 hours since last check, skipping update check')
  }

  const shouldNotify =
    !currentCache.lastNotified || now - currentCache.lastNotified >= UPDATE_CHECK_INTERVAL

  if (!shouldNotify) {
    debug('Less than 12 hours since last nag, skipping')
    return
  }

  if (!currentCache.latestVersion) {
    debug('No cached latest version result found')
    return
  }

  const comparison = semver.compare(currentCache.latestVersion, config.version)

  if (comparison < 0) {
    debug('Remote version older than local')
    return
  }

  if (comparison === 0) {
    debug('No update found')
    return
  }

  debug('Update is available (%s)', currentCache.latestVersion)
  showUpdateNotification(config.version, currentCache.latestVersion)
  currentCache.lastNotified = now
  store.set('updateCheck', currentCache)
}

/**
 * Fetch the latest version from npm with a timeout
 */
async function fetchLatestVersionWithTimeout(
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

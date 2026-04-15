import {homedir} from 'node:os'
import {join as joinPath} from 'node:path'

import {isStaging} from './isStaging.js'

function envSuffix(): string {
  return isStaging() ? '-staging' : ''
}

/**
 * Returns the base Sanity configuration directory for the current user.
 * For persistent user settings (auth tokens, preferences, etc.).
 * Respects `SANITY_INTERNAL_ENV=staging` to isolate staging instances.
 *
 * Layout: `~/.config/sanity{-staging}/`
 *
 * @returns Absolute path to the config directory
 * @internal
 */
export function getSanityConfigDir(): string {
  return joinPath(homedir(), '.config', `sanity${envSuffix()}`)
}

/**
 * Returns the base Sanity data directory for the current user.
 * For ephemeral runtime state (dev-server registries, caches, etc.).
 * Respects `SANITY_INTERNAL_ENV=staging` to isolate staging instances.
 *
 * Layout: `~/.sanity{-staging}/`
 *
 * @returns Absolute path to the data directory
 * @internal
 */
export function getSanityDataDir(): string {
  return joinPath(homedir(), `.sanity${envSuffix()}`)
}

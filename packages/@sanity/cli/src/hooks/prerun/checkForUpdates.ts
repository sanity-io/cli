import {type Hook} from '@oclif/core'

import {checkForUpdates as checkForUpdatesUtil} from '../../util/update/updateChecker.js'

/**
 * Prerun hook that checks for CLI updates and notifies the user if a new version is available.
 * This is non-blocking and will silently fail if anything goes wrong.
 */
export const checkForUpdates: Hook.Prerun = async function ({config}) {
  try {
    await checkForUpdatesUtil(config)
  } catch {
    // Silently fail - never interrupt user
  }
}

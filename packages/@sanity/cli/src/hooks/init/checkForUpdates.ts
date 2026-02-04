import {type Hook} from '@oclif/core'

import {updateChecker} from '../../util/update/updateChecker.js'

/**
 * Init hook that checks for CLI updates and notifies the user if a new version is available.
 * This is non-blocking and will silently fail if anything goes wrong.
 */
export const checkForUpdates: Hook.Init = async function ({config}) {
  try {
    await updateChecker(config)
  } catch {
    // Silently fail - never interrupt user
  }
}

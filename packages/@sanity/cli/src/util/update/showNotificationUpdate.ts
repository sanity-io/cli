import {boxen} from '@sanity/cli-core/ux'

import {detectPackageManager} from './detectPackageCommand'
import getUpdateCommand from './getUpdateCommand'

/**
 * Show a boxed notification about the available update
 */
export function showUpdateNotification(currentVersion: string, latestVersion: string): void {
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

import {boxen} from '@sanity/cli-core/ux'

import {getPackageManagerChoice} from '../packageManager/packageManagerChoice.js'
import getUpdateCommand from './getUpdateCommand.js'

/**
 * Show a boxed notification about the available update
 */
export async function showUpdateNotification(
  currentVersion: string,
  latestVersion: string,
): Promise<void> {
  const {chosen} = await getPackageManagerChoice(process.cwd(), {interactive: false})
  const command = getUpdateCommand(chosen)

  const message = `Update available: ${currentVersion} → ${latestVersion}\n\nRun ${command} to update`

  const boxed = boxen(message, {
    borderColor: 'yellow',
    borderStyle: 'round',
    margin: 1,
    padding: 1,
  })

  process.stderr.write('\n' + boxed + '\n')
}

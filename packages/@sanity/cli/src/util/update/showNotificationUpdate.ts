import {ux} from '@oclif/core'
import {boxen} from '@sanity/cli-core/ux'
import isInstalledGlobally from 'is-installed-globally'

import {getPackageManagerChoice} from '../packageManager/packageManagerChoice.js'
import {cliPkgName, getUpdateCommand} from './getUpdateCommand.js'
import {isInstalledUsingYarn} from './isInstalledUsingYarn.js'

/**
 * Show a boxed notification about the available update
 */
export async function showUpdateNotification(
  currentVersion: string,
  latestVersion: string,
): Promise<void> {
  let command

  // Check if CLI is installed globally
  if (isInstalledGlobally) {
    command = isInstalledUsingYarn()
      ? `yarn global add ${cliPkgName}`
      : `npm install -g ${cliPkgName}`
  } else {
    const {chosen} = await getPackageManagerChoice(process.cwd(), {interactive: false})
    command = getUpdateCommand(chosen)
  }

  const message = `Update available: ${currentVersion} → ${latestVersion}\n\nRun ${command} to update`

  const boxed = boxen(message, {
    borderColor: 'yellow',
    borderStyle: 'round',
    margin: 1,
    padding: 1,
  })

  ux.stderr('\n' + boxed + '\n')
}

import {styleText} from 'node:util'

import {ux} from '@oclif/core'
import {boxen} from '@sanity/cli-core/ux'
import isInstalledGlobally from 'is-installed-globally'

import {type SanityPackage} from '../packageManager/installationInfo/types.js'
import {getPackageManagerChoice} from '../packageManager/packageManagerChoice.js'
import {getUpdateCommand} from './getUpdateCommand.js'
import {isInstalledUsingYarn} from './isInstalledUsingYarn.js'

/**
 * Show a boxed notification about the available update
 */
export async function showUpdateNotification(
  currentVersion: string,
  latestVersion: string,
  packageName: SanityPackage,
): Promise<void> {
  let command

  // Check if CLI is installed globally
  if (isInstalledGlobally) {
    command = isInstalledUsingYarn()
      ? `yarn global add ${packageName}`
      : `npm install -g ${packageName}`
  } else {
    const {chosen} = await getPackageManagerChoice(process.cwd(), {interactive: false})
    command = getUpdateCommand(chosen, packageName)
  }

  const message = `Update available: ${styleText('dim', currentVersion)} → ${styleText('green', latestVersion)}\n\nRun ${styleText('cyan', command)} to update`

  const boxed = boxen(message, {
    borderColor: 'yellow',
    borderStyle: 'round',
    margin: 1,
    padding: 1,
  })

  ux.stderr('\n' + boxed + '\n')
}

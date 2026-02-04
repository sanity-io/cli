import isInstalledGlobally from 'is-installed-globally'

import {type PackageManager} from '../packageManager/packageManagerChoice.js'
import {isInstalledUsingYarn} from './isInstalledUsingYarn.js'

const cliPkgName = 'sanity'

/**
 * Get the appropriate update command for the package manager
 */
export default function getUpdateCommand(pm: PackageManager): string {
  // Check if CLI is installed globally
  if (isInstalledGlobally) {
    if (isInstalledUsingYarn()) {
      return `yarn global add ${cliPkgName}`
    }
    return `npm install -g ${cliPkgName}`
  }

  // Local installation commands
  const localCommands: Record<PackageManager, string> = {
    bun: `bun update ${cliPkgName}`,
    manual: `npm update ${cliPkgName}`,
    npm: `npm update ${cliPkgName}`,
    pnpm: `pnpm update ${cliPkgName}`,
    yarn: `yarn upgrade ${cliPkgName}`,
  }
  return localCommands[pm]
}

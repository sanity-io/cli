import {getYarnMajorVersion} from '@sanity/cli-core/package-manager'

import {type SanityPackage} from '../packageManager/installationInfo/types.js'
import {type PackageManager} from '../packageManager/packageManagerChoice.js'

/**
 * Get the appropriate update command for the package manager
 */
export function getUpdateCommand(pm: PackageManager, packageName: SanityPackage): string {
  if (pm === 'yarn') {
    const yarnMajor = getYarnMajorVersion()
    const cmd = yarnMajor !== undefined && yarnMajor >= 2 ? 'up' : 'upgrade'
    return `yarn ${cmd} ${packageName}`
  }

  const localCommands: Record<Exclude<PackageManager, 'yarn'>, string> = {
    bun: `bun update ${packageName}`,
    manual: `npm update ${packageName}`,
    npm: `npm update ${packageName}`,
    pnpm: `pnpm update ${packageName}`,
  }
  return localCommands[pm]
}

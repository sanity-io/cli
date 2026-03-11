import {getYarnMajorVersion} from '@sanity/cli-core/package-manager'

import {type PackageManager} from '../packageManager/packageManagerChoice.js'

export const cliPkgName = 'sanity'

/**
 * Get the appropriate update command for the package manager
 */
export function getUpdateCommand(pm: PackageManager): string {
  if (pm === 'yarn') {
    const yarnMajor = getYarnMajorVersion()
    const cmd = yarnMajor !== undefined && yarnMajor >= 2 ? 'up' : 'upgrade'
    return `yarn ${cmd} ${cliPkgName}`
  }

  const localCommands: Record<Exclude<PackageManager, 'yarn'>, string> = {
    bun: `bun update ${cliPkgName}`,
    manual: `npm update ${cliPkgName}`,
    npm: `npm update ${cliPkgName}`,
    pnpm: `pnpm update ${cliPkgName}`,
  }
  return localCommands[pm]
}

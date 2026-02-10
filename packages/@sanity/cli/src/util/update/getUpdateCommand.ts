import {type PackageManager} from '../packageManager/packageManagerChoice.js'

export const cliPkgName = 'sanity'

/**
 * Get the appropriate update command for the package manager
 */
export function getUpdateCommand(pm: PackageManager): string {
  const localCommands: Record<PackageManager, string> = {
    bun: `bun update ${cliPkgName}`,
    manual: `npm update ${cliPkgName}`,
    npm: `npm update ${cliPkgName}`,
    pnpm: `pnpm update ${cliPkgName}`,
    yarn: `yarn upgrade ${cliPkgName}`,
  }
  return localCommands[pm]
}

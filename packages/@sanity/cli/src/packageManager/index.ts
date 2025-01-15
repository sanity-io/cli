import {getInstallCommand} from './getInstallCommand.js'
import {getCliUpgradeCommand} from './getUpgradeCommand.js'
import {installDeclaredPackages, installNewPackages} from './installPackages.js'
import {getPackageManagerChoice} from './packageManagerChoice.js'
import {uninstallPackages} from './uninstallPackages.js'
import {getYarnStub} from './yarnStub.js'

// Exported for internal CLI usage
export {
  getCliUpgradeCommand,
  getInstallCommand,
  getPackageManagerChoice,
  getYarnStub,
  installDeclaredPackages,
  installNewPackages,
  uninstallPackages,
}

// Exported for use in `sanity` (formerly `@sanity/core`)

/**
 * @internal
 */
export const cliPackageManager = {
  getInstallCommand,
  getPackageManagerChoice,
  installNewPackages,
}

/**
 * @internal
 */
export type CliPackageManager = typeof cliPackageManager

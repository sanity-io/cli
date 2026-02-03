import {styleText} from 'node:util'

import {Output} from '@sanity/cli-core'

import {
  ALLOWED_PACKAGE_MANAGERS,
  allowedPackageManagersString,
  getPackageManagerChoice,
  PackageManager,
} from '../../util/packageManager/packageManagerChoice.js'

interface ResolvePackageManagerOptions {
  interactive: boolean
  output: Output
  packageManager: PackageManager
  targetDir: string
}

export async function resolvePackageManager({
  interactive,
  output,
  packageManager,
  targetDir,
}: ResolvePackageManagerOptions): Promise<PackageManager> {
  // If the user has specified a package manager, and it's allowed use that
  if (packageManager && ALLOWED_PACKAGE_MANAGERS.includes(packageManager as PackageManager)) {
    return packageManager
  }

  // Otherwise, try to find the most optimal package manager to use
  const chosen = (
    await getPackageManagerChoice(targetDir, {
      interactive,
    })
  ).chosen

  // only log warning if a package manager flag is passed
  if (packageManager) {
    output.warn(
      styleText(
        'yellow',
        `Given package manager "${packageManager}" is not supported. Supported package managers are ${allowedPackageManagersString}.`,
      ),
    )
    output.log(`Using ${chosen} as package manager`)
  }

  return chosen
}

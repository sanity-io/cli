import {subdebug} from '@sanity/cli-core'

import {
  findInstalledPackage,
  findPackageDeclaration,
} from '../packageManager/installationInfo/detectPackages.js'
import {type SanityPackage} from '../packageManager/installationInfo/types.js'

const debug = subdebug('updateChecker')

export interface UpdateTarget {
  installedVersion: string
  packageName: SanityPackage
}

/**
 * Determine which package to check for updates and what version is currently installed.
 *
 * If the user's project declares `sanity` as a dependency and it's installed,
 * we check `sanity` (since that's what the user manages). Otherwise, we fall back
 * to `@sanity/cli` (the currently running CLI binary).
 */
export async function resolveUpdateTarget(cwd: string, cliVersion: string): Promise<UpdateTarget> {
  // Check if `sanity` is a dependency in the local project
  const sanityDeclaration = await findPackageDeclaration('sanity', cwd)

  if (sanityDeclaration) {
    debug('Project declares sanity as a dependency, checking installed version')
    const sanityInstalled = await findInstalledPackage('sanity', cwd)

    if (sanityInstalled) {
      debug('Installed sanity version: %s', sanityInstalled.version)
      return {installedVersion: sanityInstalled.version, packageName: 'sanity'}
    }

    debug('sanity is declared but not installed, falling back to @sanity/cli')
  }

  return {installedVersion: cliVersion, packageName: '@sanity/cli'}
}

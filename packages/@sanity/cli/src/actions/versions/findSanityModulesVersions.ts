import path from 'node:path'

import {spinner} from '@sanity/cli-core'
import promiseProps from 'promise-props-recursive'
import semver from 'semver'
import semverCompare from 'semver-compare'

import {getCliVersion} from '../../util/getCliVersion.js'
import {readPackageJson} from '../../util/readPackageJson.js'
import {buildPackageArray} from './buildPackageArray.js'
import {filterSanityModules} from './filterSanityModules.js'
import {type ModuleVersionInfo, type ModuleVersionResult} from './types.js'
import {versionsDebug} from './versionsDebug.js'

/**
 * @internal
 */
interface PrintVersionArgs {
  cwd: string
}

/**
 * Print the versions of the all sanity and `@sanity/*` packages.
 *
 * @internal
 */
export async function findSanityModulesVersions(
  args: PrintVersionArgs,
): Promise<ModuleVersionResult[]> {
  const {cwd} = args
  const cliVersion = await getCliVersion()

  versionsDebug(`Sanity CLI version: ${cliVersion}`)

  const packageJsonPath = path.join(cwd, 'package.json')
  versionsDebug(`Reading package.json from ${packageJsonPath}`)
  // Declared @sanity/* modules and their wanted versions in package.json
  const packageJson = await readPackageJson(packageJsonPath)
  versionsDebug('Resolved package.json:', packageJson)

  const filteredSanityModules = filterSanityModules(packageJson)
  versionsDebug('sanity modules:', filteredSanityModules)

  const spin = spinner('Resolving latest versions').start()

  try {
    const versions = await promiseProps<ModuleVersionInfo[]>(
      buildPackageArray(filteredSanityModules, cwd, cliVersion),
    )

    const packages = Object.values(versions)
    versionsDebug('packages:', packages)

    return packages.map((mod) => {
      const current = mod.installed || semver.minVersion(mod.declared)?.toString() || ''
      const needsUpdate = mod.latest ? semverCompare(current, mod.latest) === -1 : false

      return {...mod, needsUpdate}
    })
  } catch (error) {
    versionsDebug('Error finding sanity modules versions:', error)
    throw error
  } finally {
    spin.stop()
  }
}

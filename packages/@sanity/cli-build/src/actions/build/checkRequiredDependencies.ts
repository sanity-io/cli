import path from 'node:path'

import {getLocalPackageVersion, readPackageJson} from '@sanity/cli-core/package-manager'
import {type PackageJson} from '@sanity/cli-core/types'
import {oneline} from 'oneline'
import {minVersion, satisfies, type SemVer} from 'semver'

import {type BuildStudioEventListener} from './buildStudio'

const defaultStudioManifestProps: Partial<PackageJson> = {
  name: 'studio',
  version: '1.0.0',
}

interface CheckResult {
  installedSanityVersion: string
}

export interface CheckRequiredDependenciesOptions {
  isApp: boolean
  onIncompatibleDeclaredStyledComponentsVersionRange: BuildStudioEventListener['onIncompatibleDeclaredStyledComponentsVersionRange']

  onIncompatibleInstalledStyledComponentsVersionRange: BuildStudioEventListener['onIncompatibleInstalledStyledComponentsVersionRange']
  onInvalidStyledComponentsVersionRange: BuildStudioEventListener['onInvalidStyledComponentsVersionRange']
  onNoDeclaredStyledComponentsVersion: BuildStudioEventListener['onNoDeclaredStyledComponentsVersion']
  onNoInstalledSanityVersion: BuildStudioEventListener['onNoInstalledSanityVersion']
  onNoInstalledStyledComponentsVersion: BuildStudioEventListener['onNoInstalledStyledComponentsVersion']
  workDir: string
}

const styledComponentsVersionRange = '^6.1.15'

/**
 * Checks that the studio has declared and installed the required dependencies
 * needed by the Sanity modules. While we generally use regular, explicit
 * dependencies in modules, there are certain dependencies that are better
 * served being peer dependencies, such as react and styled-components.
 *
 * If these dependencies are not installed/declared, we report an error
 * and instruct the user to install them manually.
 *
 * Additionally, returns the version of the 'sanity' dependency from the package.json.
 */
export async function checkRequiredDependencies(
  options: CheckRequiredDependenciesOptions,
): Promise<CheckResult> {
  const {isApp, workDir: studioPath} = options
  // currently there's no check needed for core apps,
  // but this should be removed once they are more mature
  if (isApp) {
    return {installedSanityVersion: ''}
  }

  const [studioPackageManifest, installedStyledComponentsVersion, installedSanityVersion] =
    await Promise.all([
      readPackageJson(path.join(studioPath, 'package.json'), {
        defaults: defaultStudioManifestProps,
        skipSchemaValidation: true,
      }),
      getLocalPackageVersion('styled-components', studioPath),
      getLocalPackageVersion('sanity', studioPath),
    ])

  const wantedStyledComponentsVersionRange = styledComponentsVersionRange

  // Retrieve the version of the 'sanity' dependency
  if (!installedSanityVersion) {
    options.onNoInstalledSanityVersion({message: 'Failed to read the installed sanity version.'})
    return {installedSanityVersion: ''}
  }

  // The studio _must_ now declare `styled-components` as a dependency. If it's not there,
  // we'll want to automatically _add it_ to the manifest and tell the user to reinstall
  // dependencies before running whatever command was being run
  const declaredStyledComponentsVersion =
    studioPackageManifest.dependencies?.['styled-components'] ||
    studioPackageManifest?.devDependencies?.['styled-components']

  if (!declaredStyledComponentsVersion) {
    options.onNoDeclaredStyledComponentsVersion({
      message: oneline`
      Declared dependency \`styled-components\` is not installed - run
      \`npm install\`, \`yarn install\` or \`pnpm install\` to install it before re-running this command.
    `,
    })
    return {installedSanityVersion}
  }

  // We ignore catalog identifiers since we check the actual version anyway
  const isStyledComponentsVersionRangeInCatalog =
    declaredStyledComponentsVersion.startsWith('catalog:')
  // Theoretically the version specified in package.json could be incorrect, eg `foo`
  let minDeclaredStyledComponentsVersion: SemVer | null = null
  try {
    minDeclaredStyledComponentsVersion = minVersion(declaredStyledComponentsVersion)
  } catch {
    // Intentional fall-through (variable will be left as null, throwing below)
  }

  if (!minDeclaredStyledComponentsVersion && !isStyledComponentsVersionRangeInCatalog) {
    options.onInvalidStyledComponentsVersionRange({
      message: oneline`
      Declared dependency \`styled-components\` has an invalid version range:
      \`${declaredStyledComponentsVersion}\`.
    `,
    })
    return {installedSanityVersion}
  }

  // The declared version should be semver-compatible with the version specified as a
  // peer dependency in `sanity`. If not, we should tell the user to change it.
  //
  // Exception: Ranges are hard to compare. `>=5.0.0 && <=5.3.2 || ^6`... Comparing this
  // to anything is going to be challenging, so only compare "simple" ranges/versions
  // (^x.x.x / ~x.x.x / x.x.x)
  if (
    !isStyledComponentsVersionRangeInCatalog &&
    isComparableRange(declaredStyledComponentsVersion) &&
    !satisfies(minDeclaredStyledComponentsVersion!, wantedStyledComponentsVersionRange)
  ) {
    options.onIncompatibleDeclaredStyledComponentsVersionRange({
      message: oneline`
      Declared version of styled-components (${declaredStyledComponentsVersion})
      is not compatible with the version required by sanity (${wantedStyledComponentsVersionRange}).
      This might cause problems!
    `,
    })
  }

  // Ensure the studio has _installed_ a version of `styled-components`
  if (!installedStyledComponentsVersion) {
    options.onNoInstalledStyledComponentsVersion({
      message: oneline`
      Declared dependency \`styled-components\` is not installed - run
      \`npm install\`, \`yarn install\` or \`pnpm install\` to install it before re-running this command.
    `,
    })
    return {installedSanityVersion}
  }

  // The studio should have an _installed_ version of `styled-components`, and it should
  // be semver compatible with the version specified in `sanity` peer dependencies.
  if (!satisfies(installedStyledComponentsVersion, wantedStyledComponentsVersionRange)) {
    options.onIncompatibleInstalledStyledComponentsVersionRange({
      message: oneline`
      Installed version of styled-components (${installedStyledComponentsVersion})
      is not compatible with the version required by sanity (${wantedStyledComponentsVersionRange}).
      This might cause problems!
    `,
    })
  }

  return {installedSanityVersion}
}

function isComparableRange(range: string): boolean {
  return /^[\^~]?\d+(\.\d+)?(\.\d+)?$/.test(range)
}

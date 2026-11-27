import path from 'node:path'

import {exitCodes} from '@sanity/cli-core/ExitCodes'
import {
  getLocalPackageDir,
  getLocalPackageVersion,
  readPackageJson,
} from '@sanity/cli-core/package-manager'
import {type Output} from '@sanity/cli-core/types'
import {
  coerce,
  gt,
  gtr,
  ltr,
  minVersion,
  rcompare,
  satisfies,
  type SemVer,
  validRange,
} from 'semver'

interface PackageInfo {
  deprecatedBelow: string | null
  installed: SemVer
  isDeprecated: boolean
  isUnsupported: boolean
  isUntested: boolean
  name: string
  supported: string[]
}

interface TrackedPackage {
  deprecatedBelow: string | null
  name: string
  supported: string[]
}

// NOTE: when doing changes here, also remember to update versions in help docs at
// https://sanity.io/admin/structure/docs;helpArticle;upgrade-packages
const DEFAULT_PACKAGES: TrackedPackage[] = [
  {deprecatedBelow: null, name: 'react', supported: ['^19.2.2']},
  {deprecatedBelow: null, name: 'react-dom', supported: ['^19.2.2']},
  {deprecatedBelow: null, name: 'styled-components', supported: ['^6.1.15']},
  {deprecatedBelow: '^3', name: '@sanity/ui', supported: ['^2', '^3', '^4']},
]

/**
 * Packages for which the installed `sanity` package may raise the required range through its
 * `peerDependencies`, letting a newer Studio major demand a newer minimum without a CLI release.
 */
const PEER_REQUIREMENT_PACKAGES = new Set(['react', 'react-dom', 'styled-components'])

/**
 * Raises the supported range of tracked packages to the range declared in the installed `sanity`
 * package's `peerDependencies`, but only when that range has a higher minimum than the default.
 * Peer ranges that are missing, invalid or not stricter leave the defaults untouched.
 */
async function applySanityPeerRequirements(
  workDir: string,
  packages: TrackedPackage[],
): Promise<TrackedPackage[]> {
  let peerDependencies: Record<string, string> | undefined
  try {
    const sanityManifest = await readPackageJson(
      path.join(getLocalPackageDir('sanity', workDir), 'package.json'),
      {skipSchemaValidation: true},
    )
    peerDependencies = sanityManifest?.peerDependencies
  } catch {
    return packages
  }

  if (!peerDependencies) {
    return packages
  }

  return packages.map((pkg) => {
    const peerRange = PEER_REQUIREMENT_PACKAGES.has(pkg.name) ? peerDependencies[pkg.name] : null
    if (!peerRange || !validRange(peerRange)) {
      return pkg
    }

    const defaultMinimum = minVersion(pkg.supported.join(' || '))
    const peerMinimum = minVersion(peerRange)
    if (!defaultMinimum || !peerMinimum || !gt(peerMinimum, defaultMinimum)) {
      return pkg
    }

    return {...pkg, supported: [peerRange]}
  })
}

export async function checkStudioDependencyVersions(
  workDir: string,
  output: Output,
  {packages: basePackages = DEFAULT_PACKAGES}: {packages?: TrackedPackage[]} = {},
): Promise<void> {
  const manifest = await readPackageJson(path.join(workDir, 'package.json'), {
    skipSchemaValidation: true,
  })
  const dependencies = {...manifest?.dependencies, ...manifest?.devDependencies}
  const packages = await applySanityPeerRequirements(workDir, basePackages)

  const packageInfo = packages.map(async (pkg): Promise<false | PackageInfo> => {
    const dependency = dependencies[pkg.name]
    if (!dependency) {
      return false
    }

    const packageVersion = await getLocalPackageVersion(pkg.name, workDir)
    const installed = coerce(packageVersion ?? dependency.replaceAll(/[\D.]/g, ''))

    if (!installed) {
      return false
    }

    const supported = pkg.supported.join(' || ')

    // "Untested" is usually the case where we have not upgraded the React version requirements
    // before a release, but given that is usually works in a backwards-compatible way, we want
    // to indicate that it's _untested_, not necessarily _unsupported_
    // Ex: Installed is react@20.0.0, but we've only _tested_ with react@^19
    const isUntested = !satisfies(installed, supported) && gtr(installed, supported)

    // "Unsupported" in that the installed version is _lower than_ the minimum version
    // Ex: Installed is react@18.0.0, but we require react@^19.2
    const isUnsupported = !satisfies(installed, supported) && !isUntested

    // "Deprecated" in that we will stop supporting it at some point in the near future,
    // so users should be prompted to upgrade
    const isDeprecated = pkg.deprecatedBelow ? ltr(installed, pkg.deprecatedBelow) : false

    return {
      ...pkg,
      installed,
      isDeprecated,
      isUnsupported,
      isUntested,
    }
  })

  const installedPackages = (await Promise.all(packageInfo)).filter(
    (inp): inp is PackageInfo => inp !== false,
  )
  const unsupported = installedPackages.filter((pkg) => pkg.isUnsupported)
  const deprecated = installedPackages.filter((pkg) => !pkg.isUnsupported && pkg.isDeprecated)
  const untested = installedPackages.filter((pkg) => pkg.isUntested)

  if (deprecated.length > 0) {
    output.warn(`The following package versions have been deprecated and should be upgraded:

  ${listPackages(deprecated)}

Support for these will be removed in a future release!

  ${getUpgradeInstructions(deprecated)}
`)
  }

  if (untested.length > 0) {
    output.warn(`The following package versions have not yet been marked as supported:

  ${listPackages(untested)}

You _may_ encounter bugs while using these versions.

  ${getDowngradeInstructions(untested)}
`)
  }

  if (unsupported.length > 0) {
    output.error(
      `The following package versions are no longer supported and needs to be upgraded:

  ${listPackages(unsupported)}

  ${getUpgradeInstructions(unsupported)}
`,
      {exit: exitCodes.RUNTIME_ERROR},
    )
  }
}

function listPackages(pkgs: PackageInfo[]) {
  return pkgs
    .map((pkg) => {
      const want =
        pkg.isDeprecated && !pkg.isUnsupported && !pkg.isUntested
          ? pkg.deprecatedBelow
          : pkg.supported.join(' || ')

      return `${pkg.name} (installed: ${pkg.installed}, want: ${want})`
    })
    .join('\n  ')
}

function getUpgradeInstructions(pkgs: PackageInfo[]) {
  const inst = pkgs
    .map((pkg) => {
      const [highestSupported] = pkg.supported
        .map((version) => (coerce(version) || {version: ''}).version)
        .toSorted(rcompare)

      return `"${pkg.name}@^${highestSupported}"`
    })
    .join(' ')

  return `To upgrade, run either:

  npm install ${inst}

  or

  yarn add ${inst}

  or

  pnpm add ${inst}


Read more at https://www.sanity.io/docs/help/upgrade-packages`
}

function getDowngradeInstructions(pkgs: PackageInfo[]) {
  const inst = pkgs
    .map((pkg) => {
      const [highestSupported] = pkg.supported
        .map((version) => (coerce(version) || {version: ''}).version)
        .toSorted(rcompare)

      return `"${pkg.name}@^${highestSupported}"`
    })
    .join(' ')

  return `To downgrade, run either:

  yarn add ${inst}

  or

  npm install ${inst}

  or

  pnpm install ${inst}`
}

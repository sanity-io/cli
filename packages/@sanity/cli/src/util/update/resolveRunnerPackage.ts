import {readFile, realpath} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'

import {type SanityPackage} from '../packageManager/installationInfo/types.js'

const KNOWN_PACKAGES = new Set<SanityPackage>(['@sanity/cli', 'sanity'])

interface RunnerPackage {
  installedVersion: string
  packageName: SanityPackage
}

export async function resolveRunnerPackage(
  binaryPath: string = process.argv[1] ?? '',
  fallbackVersion = '',
): Promise<RunnerPackage> {
  try {
    let dir = dirname(await realpath(binaryPath))
    while (dir !== resolve(dir, '..')) {
      try {
        const pkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'))
        if (typeof pkg.name === 'string' && isKnownSanityPackage(pkg.name)) {
          return {
            installedVersion: typeof pkg.version === 'string' ? pkg.version : fallbackVersion,
            packageName: pkg.name,
          }
        }
      } catch {
        // keep walking
      }
      dir = dirname(dir)
    }
  } catch {
    // fall through
  }

  return {installedVersion: fallbackVersion, packageName: '@sanity/cli'}
}

function isKnownSanityPackage(name: string): name is SanityPackage {
  return KNOWN_PACKAGES.has(name as SanityPackage)
}

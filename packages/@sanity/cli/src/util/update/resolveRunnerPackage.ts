import {readFile, realpath} from 'node:fs/promises'
import {dirname, resolve} from 'node:path'

import {subdebug} from '@sanity/cli-core'

import {type SanityPackage} from '../packageManager/installationInfo/types.js'

const debug = subdebug('updateChecker')

const KNOWN_PACKAGES = new Set<SanityPackage>(['@sanity/cli', 'sanity'])
const MAX_WALK_ITERATIONS = 25

interface RunnerPackage {
  installedVersion: string
  packageName: SanityPackage
}

/**
 * Resolve the Sanity package name + installed version from a runner install.
 * Falls back to `sanity` + `fallbackVersion` when the walk can't determine them.
 */
export async function resolveRunnerPackage(
  binaryPath: string = process.argv[1] ?? '',
  fallbackVersion = '',
): Promise<RunnerPackage> {
  try {
    // Follow the runner's .bin/sanity symlink to the real bin file, then walk
    // up until we hit a package.json for a known Sanity package.
    let dir = dirname(await realpath(binaryPath))
    for (let i = 0; i < MAX_WALK_ITERATIONS && dir !== resolve(dir, '..'); i++) {
      try {
        const pkg = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'))
        if (
          typeof pkg.name === 'string' &&
          typeof pkg.version === 'string' &&
          isKnownSanityPackage(pkg.name)
        ) {
          return {installedVersion: pkg.version, packageName: pkg.name}
        }
      } catch {
        // ignore missing/malformed package.json and keep walking
      }
      dir = dirname(dir)
    }
    debug('resolveRunnerPackage: walk exhausted without finding a known Sanity package')
  } catch (err) {
    debug('resolveRunnerPackage: realpath failed for %s (%s)', binaryPath, err)
  }

  return {installedVersion: fallbackVersion, packageName: 'sanity'}
}

function isKnownSanityPackage(name: string): name is SanityPackage {
  return KNOWN_PACKAGES.has(name as SanityPackage)
}

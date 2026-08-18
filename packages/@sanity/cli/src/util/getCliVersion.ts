import path from 'node:path'

import {type PackageJson, readPackageJson} from '@sanity/cli-core'

/**
 * Get the version of the `@sanity/cli` package.
 *
 * @internal
 * @returns The version of the `@sanity/cli` package.
 */
export async function getCliVersion(): Promise<string> {
  let pkg: PackageJson | undefined
  try {
    pkg = await readPackageJson(path.join(import.meta.dirname, '..', '..', 'package.json'))
  } catch (err) {
    throw new Error(`Unable to read @sanity/cli/package.json: ${(err as Error).message}`, {
      cause: err,
    })
  }

  return pkg.version
}

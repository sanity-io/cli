import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {packageDirectory} from 'pkg-dir'

import {type PackageJson, readPackageJson} from './readPackageJson.js'

/**
 * Get the version of the `@sanity/cli` package.
 *
 * @internal
 * @returns The version of the `@sanity/cli` package.
 */
export async function getCliVersion(): Promise<string> {
  // using the meta.url will resolve to the code running from the cli
  // this will find the package.json in cli package.
  const cliPath = await packageDirectory({cwd: fileURLToPath(import.meta.url)})
  if (!cliPath) {
    throw new Error('Unable to resolve root of @sanity/cli module')
  }

  let pkg: PackageJson | undefined
  try {
    pkg = await readPackageJson(path.join(cliPath, 'package.json'))
  } catch (err) {
    throw new Error(`Unable to read @sanity/cli/package.json: ${(err as Error).message}`)
  }

  return pkg.version
}

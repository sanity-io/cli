import {createRequire} from 'node:module'

import {installDeferredPackage} from './installDeferredPackage.js'
import {resolveLocalPackage} from './util/resolveLocalPackage.js'

/** Loads an already installed release or installs the feature on demand. @internal */
export async function loadDeferredModule<T>(
  name: string,
  version: string,
  entry: string,
  from: string,
  loadLocal: () => Promise<T>,
): Promise<T> {
  if (getInstalledVersion(name, from) === version) return loadLocal()
  const directory = await installDeferredPackage(name, version)
  return resolveLocalPackage<T>(entry, directory)
}

function getInstalledVersion(name: string, from: string): string | undefined {
  try {
    const requirePackage = createRequire(from)
    const manifest = requirePackage(`${name}/package.json`) as {version?: string}
    return manifest.version
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'MODULE_NOT_FOUND' && code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error
    return undefined
  }
}

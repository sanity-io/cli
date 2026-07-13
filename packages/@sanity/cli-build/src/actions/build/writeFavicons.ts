import fs from 'node:fs/promises'
import path from 'node:path'

import {up as packageUp} from 'empathic/package'

import {copyDir} from '../../util/copyDir.js'
import {writeWebManifest} from './writeWebManifest.js'

/**
 * @internal
 */
export async function getDefaultFaviconsPath(): Promise<string> {
  const sanityCliPkgPath = packageUp({cwd: import.meta.dirname})
  if (!sanityCliPkgPath) {
    throw new Error('Unable to resolve `@sanity/cli-build` module root')
  }

  return path.join(path.dirname(sanityCliPkgPath), 'static', 'favicons')
}

/**
 * @internal
 */
export async function writeFavicons(basePath: string, destDir: string): Promise<void> {
  const faviconsPath = await getDefaultFaviconsPath()

  await fs.mkdir(destDir, {recursive: true})
  await copyDir(faviconsPath, destDir, true)
  await writeWebManifest(basePath, destDir)

  // Copy the /static/favicon.ico to /favicon.ico as well, because some tools/browsers
  // blindly expects it to be there before requesting the HTML containing the actual path
  await fs.copyFile(path.join(destDir, 'favicon.ico'), path.join(destDir, '..', 'favicon.ico'))
}

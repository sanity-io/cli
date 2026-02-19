import fs from 'node:fs/promises'
import path from 'node:path'

import {subdebug} from '@sanity/cli-core'
import {readPackageUp} from 'read-package-up'

import {copyDir} from '../../util/copyDir.js'
import {writeWebManifest} from './writeWebManifest.js'

const debug = subdebug('writeFavicons')

export async function writeFavicons(basePath: string, destDir: string): Promise<void> {
  const sanityPkgPath = (await readPackageUp({cwd: import.meta.dirname}))?.path

  debug('sanityPkgPath: %s', sanityPkgPath)
  const faviconsPath = sanityPkgPath
    ? path.join(path.dirname(sanityPkgPath), 'static', 'favicons')
    : undefined

  debug('faviconsPath: %s', faviconsPath)

  if (!faviconsPath) {
    throw new Error('Unable to resolve `sanity` module root')
  }

  debug('destDir: %s', destDir)

  await fs.mkdir(destDir, {recursive: true})
  await copyDir(faviconsPath, destDir, true)
  await writeWebManifest(basePath, destDir)

  // Copy the /static/favicon.ico to /favicon.ico as well, because some tools/browsers
  // blindly expects it to be there before requesting the HTML containing the actual path
  await fs.copyFile(path.join(destDir, 'favicon.ico'), path.join(destDir, '..', 'favicon.ico'))
}

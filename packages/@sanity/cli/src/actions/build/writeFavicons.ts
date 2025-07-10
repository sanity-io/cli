import fs from 'node:fs/promises'
import path, {dirname} from 'node:path'
import {fileURLToPath} from 'node:url'

import {readPackageUp} from 'read-package-up'

import {copyDir} from '../../util/copyDir.js'
import {writeWebManifest} from './writeWebManifest.js'

export async function writeFavicons(basePath: string, destDir: string): Promise<void> {
  const dir = dirname(fileURLToPath(import.meta.url))

  const sanityPkgPath = (await readPackageUp({cwd: dir}))?.path
  const faviconsPath = sanityPkgPath
    ? path.join(path.dirname(sanityPkgPath), 'static', 'favicons')
    : undefined

  if (!faviconsPath) {
    throw new Error('Unable to resolve `sanity` module root')
  }

  await fs.mkdir(destDir, {recursive: true})
  await copyDir(faviconsPath, destDir, true)
  await writeWebManifest(basePath, destDir)

  // Copy the /static/favicon.ico to /favicon.ico as well, because some tools/browsers
  // blindly expects it to be there before requesting the HTML containing the actual path
  await fs.copyFile(path.join(destDir, 'favicon.ico'), path.join(destDir, '..', 'favicon.ico'))
}

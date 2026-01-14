import fs from 'node:fs/promises'
import path from 'node:path'

import {readdirRecursive} from './readdirRecursive.js'

interface CopyOptions {
  rename?: (originalName: string) => string
}

export async function copy(
  srcPath: string,
  dstPath: string,
  options?: CopyOptions,
): Promise<number> {
  const rename = options?.rename
  const content = (await fs.stat(srcPath)).isDirectory()
    ? await readdirRecursive(srcPath)
    : [{isDir: false, path: srcPath}]

  const directories = content
    .filter((entry) => entry.isDir)
    .toSorted((a, b) => b.path.length - a.path.length)
    .toSorted((a, b) => a.path.localeCompare(b.path))
    .map((entry) => entry.path)

  for (const subDir of directories) {
    const relativePath = path.relative(srcPath, subDir)
    const fullDstPath = path.join(dstPath, relativePath)
    await fs.mkdir(fullDstPath, {recursive: true})
  }

  const files = content
    .filter((entry) => !entry.isDir)
    .toSorted((a, b) => b.path.length - a.path.length)
    .toSorted((a, b) => a.path.localeCompare(b.path))
    .map((entry) => {
      const relativePath = path.relative(srcPath, entry.path)
      const baseName = path.basename(relativePath)
      const dirName = path.dirname(relativePath)
      const dstName = rename ? rename(baseName) : baseName
      const fullDstPath = path.join(dstPath, dirName, dstName)
      return {from: entry.path, to: fullDstPath}
    })

  for (const file of files) {
    await fs.copyFile(file.from, file.to)
  }

  return files.length
}

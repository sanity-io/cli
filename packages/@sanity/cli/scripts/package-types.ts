import {existsSync, statSync} from 'node:fs'
import {cp, readdir, readFile} from 'node:fs/promises'
import {join, relative, sep} from 'node:path'

import {preProcessFile} from 'typescript'

import {resolvePackage} from './package-dependencies.js'

async function declarations(dir: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules')
      files.push(...(await declarations(path)))
    else if (/\.[cm]?ts$/.test(entry.name)) files.push(path)
  }
  return files
}

/** Keep the declaration dependency graph available without installing command tools. */
export async function prepareTypeDependencies(
  stage: string,
  output: string,
  roots: Iterable<string>,
) {
  const queue = [...roots]
  const rootPackages = new Set(queue)
  const seen = new Set<string>()
  while (queue.length > 0) {
    const path = queue.shift()!
    if (seen.has(path)) continue
    seen.add(path)
    const dest = join(output, 'dist', relative(stage, path))
    if (existsSync(join(dest, 'package.json')) && !rootPackages.has(path)) continue
    const files = await declarations(path)
    if (!existsSync(join(dest, 'package.json'))) {
      await cp(path, dest, {
        dereference: true,
        filter: (file) =>
          !relative(path, file).split(sep).includes('node_modules') &&
          (statSync(file).isDirectory() || /(?:\.[cm]?ts|package\.json|LICENSE[^/]*)$/i.test(file)),
        recursive: true,
      })
    }
    for (const file of files) {
      const {importedFiles} = preProcessFile(await readFile(file, 'utf8'), true)
      for (const {fileName} of importedFiles) {
        if (fileName.startsWith('.') || fileName.startsWith('#') || fileName.startsWith('node:'))
          continue
        const name = fileName
          .split('/')
          .slice(0, fileName.startsWith('@') ? 2 : 1)
          .join('/')
        const dependency = resolvePackage(name, path, stage)
        if (dependency) queue.push(dependency)
      }
    }
  }
}

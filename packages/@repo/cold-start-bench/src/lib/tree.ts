import {lstat, readdir, readFile} from 'node:fs/promises'
import {join} from 'node:path'

export interface InstalledTree {
  /** Bytes on disk of every installed package, excluding nested node_modules */
  bytes: number
  /** Installed package directories, counting duplicates at different paths */
  packageCount: number
  /** `name@version` → bytes; a package installed at several paths is summed */
  packages: Record<string, number>
}

async function directorySize(dir: string, skip: string): Promise<number> {
  let total = 0
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    if (entry.name === skip) continue
    const path = join(dir, entry.name)
    total += entry.isDirectory() ? (await directorySize(path, skip)) : (await lstat(path)).size;
  }
  return total
}

async function packageDirs(nodeModules: string): Promise<string[]> {
  const dirs: string[] = []
  for (const entry of await readdir(nodeModules, {withFileTypes: true})) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const path = join(nodeModules, entry.name)
    if (entry.name.startsWith('@')) {
      for (const scoped of await readdir(path, {withFileTypes: true})) {
        if (scoped.isDirectory()) dirs.push(join(path, scoped.name))
      }
    } else {
      dirs.push(path)
    }
  }
  return dirs
}

/**
 * Walks an npm-installed `node_modules` and records what landed on disk.
 */
export async function scanInstalledTree(nodeModules: string): Promise<InstalledTree> {
  const tree: InstalledTree = {bytes: 0, packageCount: 0, packages: {}}

  async function visit(dir: string) {
    for (const pkgDir of await packageDirs(dir)) {
      let manifest: {name?: string; version?: string}
      try {
        manifest = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'))
      } catch {
        continue
      }
      const bytes = await directorySize(pkgDir, 'node_modules')
      const key = `${manifest.name}@${manifest.version}`
      tree.packageCount++
      tree.bytes += bytes
      tree.packages[key] = (tree.packages[key] ?? 0) + bytes

      const nested = join(pkgDir, 'node_modules')
      if (await lstat(nested).then((s) => s.isDirectory(), () => false)) await visit(nested)
    }
  }

  await visit(nodeModules)
  return tree
}

/** The largest installed packages, the obvious places to look for savings */
export function largestPackages(tree: InstalledTree, limit = 10): {bytes: number; id: string}[] {
  return Object.entries(tree.packages)
    .map(([id, bytes]) => ({bytes, id}))
    .toSorted((a, b) => b.bytes - a.bytes || a.id.localeCompare(b.id))
    .slice(0, limit)
}

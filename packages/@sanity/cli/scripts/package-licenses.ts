import {existsSync} from 'node:fs'
import {readdir, readFile, rm, rmdir, writeFile} from 'node:fs/promises'
import {join, relative, sep} from 'node:path'

const LEGAL = /^(?:licen[cs]e|notice|authors|copying)(?:[.-][^/]*)?$/i

interface LicensedPackage {
  files: {name: string; text: string}[]
  name: string
  version: string

  license?: string
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

/** Files of a package, excluding its nested node_modules */
async function ownFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') files.push(...(await ownFiles(path)))
    } else {
      files.push(path)
    }
  }
  return files
}

/**
 * Packages whose code is bundled are left with only a manifest and license
 * files. Their notices move into one file at the package root, so npm
 * extracts hundreds fewer files. `keep` lists package directories, relative
 * to `output`, whose manifest is read at runtime.
 */
export async function consolidateLicenses(output: string, keep: Iterable<string>) {
  const kept = new Set([...keep].map((dir) => join(output, dir)))
  const packages: LicensedPackage[] = []

  async function visit(nodeModules: string) {
    for (const dir of await packageDirs(nodeModules)) {
      const nested = join(dir, 'node_modules')
      if (existsSync(nested)) await visit(nested)
      const manifest = join(dir, 'package.json')
      if (kept.has(dir) || !existsSync(manifest)) continue
      const files = await ownFiles(dir)
      // Nested manifests only mark module types or subpaths of the bundled code.
      const legal = files.filter((file) => !file.endsWith(`${sep}package.json`))
      if (!legal.every((file) => LEGAL.test(relative(dir, file)))) continue
      const pkg = JSON.parse(await readFile(manifest, 'utf8'))
      packages.push({
        files: await Promise.all(
          legal.toSorted().map(async (file) => ({
            name: relative(dir, file).split(sep).join('/'),
            text: await readFile(file, 'utf8'),
          })),
        ),
        license: typeof pkg.license === 'string' ? pkg.license : undefined,
        name: pkg.name ?? relative(nodeModules, dir),
        version: pkg.version ?? '',
      })
      for (const file of files) await rm(file)
      await removeEmptyDirs(dir)
    }
  }

  const root = join(output, 'dist', 'node_modules')
  if (!existsSync(root)) return {packages: 0}
  await visit(root)
  await removeEmptyDirs(root)

  const seen = new Set<string>()
  const sections: string[] = []
  for (const pkg of packages.toSorted((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  )) {
    const id = `${pkg.name}@${pkg.version}`
    if (seen.has(id)) continue
    seen.add(id)
    const body = pkg.files.map(({name, text}) => `### ${name}\n\n\`\`\`\n${text.trim()}\n\`\`\``)
    sections.push(
      [`## ${id}`, pkg.license ? `License: ${pkg.license}` : '', ...body]
        .filter(Boolean)
        .join('\n\n'),
    )
  }
  await writeFile(
    join(output, 'dist', 'THIRD-PARTY-LICENSES.md'),
    `# Third-party licenses\n\nThe Sanity CLI includes code from the following packages, bundled into its dist directory.\n\n${sections.join('\n\n')}\n`,
  )
  return {packages: seen.size}
}

async function removeEmptyDirs(dir: string): Promise<boolean> {
  let empty = true
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    if (entry.isDirectory() && (await removeEmptyDirs(join(dir, entry.name)))) continue
    empty = false
  }
  if (empty) await rmdir(dir)
  return empty
}

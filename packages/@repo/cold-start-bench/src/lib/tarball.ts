import {createHash} from 'node:crypto'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {create, extract} from 'tar'

import {type PackageManifest} from './manifest.ts'

/**
 * oclif compares the version recorded in `oclif.manifest.json` with the
 * package version, and on a mismatch warns and may ignore the manifest, which
 * would load every command at startup and skew the measurement.
 */
async function syncOclifManifest(path: string, version: string) {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return
  }
  await writeFile(path, JSON.stringify({...JSON.parse(raw), version}))
}

/**
 * Rewrites `package/package.json` inside an npm tarball and writes the result
 * to `output`. Apart from the version in `oclif.manifest.json`, everything
 * else in the tarball is kept as-is.
 */
export async function repackTarball(
  input: string,
  output: string,
  rewrite: (manifest: PackageManifest) => PackageManifest,
): Promise<PackageManifest> {
  const dir = await mkdtemp(join(tmpdir(), 'cold-start-repack-'))
  try {
    await extract({cwd: dir, file: input})
    const manifestPath = join(dir, 'package', 'package.json')
    const manifest = rewrite(JSON.parse(await readFile(manifestPath, 'utf8')))
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    await syncOclifManifest(join(dir, 'package', 'oclif.manifest.json'), manifest.version)
    await create({cwd: dir, file: output, gzip: true, portable: true}, ['package'])
    return manifest
  } finally {
    await rm(dir, {force: true, recursive: true})
  }
}

/**
 * A short content hash of several files, used to name bench versions built
 * from an uncommitted working tree.
 */
export async function hashFiles(files: readonly string[]): Promise<string> {
  const hash = createHash('sha256')
  for (const file of files.toSorted()) hash.update(await readFile(file))
  return hash.digest('hex').slice(0, 10)
}

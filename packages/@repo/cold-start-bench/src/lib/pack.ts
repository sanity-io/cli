import {existsSync} from 'node:fs'
import {mkdir, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {execa} from 'execa'

import {benchVersion, packageClosure, type PackageManifest, rewriteManifest, type WorkspacePackage} from './manifest.ts'
import {hashFiles, repackTarball} from './tarball.ts'

/** What a new user installs: `sanity` pulls `@sanity/cli`, `npm create` pulls `create-sanity` */
const ROOT_PACKAGES = ['@sanity/cli', 'create-sanity']

/**
 * Builds the packages that get packed and the workspace packages they depend
 * on, the same `build` and `build:types` tasks a release runs.
 */
export function buildArgs(): string[] {
  return [
    'exec',
    'turbo',
    'run',
    'build',
    'build:types',
    ...ROOT_PACKAGES.map((name) => `--filter=${name}...`),
  ]
}

export interface PackedPackage {
  file: string
  name: string
  version: string
}

export interface PackedVariant {
  id: string
  label: string
  packages: PackedPackage[]
  sha: string | null
}

export type Log = (message: string) => void

async function readWorkspace(root: string): Promise<Map<string, WorkspacePackage>> {
  const {stdout} = await execa('pnpm', ['ls', '-r', '--depth', '-1', '--json'], {cwd: root})
  const workspace = new Map<string, WorkspacePackage>()
  for (const {path} of JSON.parse(stdout) as {path: string}[]) {
    const manifest: PackageManifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'))
    if (manifest.name) workspace.set(manifest.name, {manifest, path})
  }
  return workspace
}

/**
 * Packs the CLI packages in `root` with pnpm (which resolves `workspace:` and
 * `catalog:` ranges and runs `prepack`), then repacks each with bench versions.
 */
async function packWorkspace(options: {
  id: ((files: string[]) => Promise<string>) | string
  outDir: string
  root: string
}): Promise<{id: string; packages: PackedPackage[]}> {
  const workspace = await readWorkspace(options.root)
  const closure = packageClosure(ROOT_PACKAGES, workspace)

  const rawDir = await mkdtemp(join(tmpdir(), 'cold-start-pack-'))
  try {
    const raw: {file: string; pkg: WorkspacePackage}[] = []
    for (const pkg of closure) {
      const {stdout} = await execa('pnpm', ['pack', '--pack-destination', rawDir, '--json'], {
        cwd: pkg.path,
      })
      const packed = JSON.parse(stdout.slice(stdout.indexOf('{')))
      raw.push({file: packed.filename, pkg})
    }

    const id = typeof options.id === 'string' ? options.id : await options.id(raw.map((r) => r.file))
    const versions = new Map(
      closure.map((pkg) => [pkg.manifest.name, benchVersion(pkg.manifest.version, id)]),
    )

    await mkdir(options.outDir, {recursive: true})
    const packages: PackedPackage[] = []
    for (const {file, pkg} of raw) {
      const version = versions.get(pkg.manifest.name)!
      const output = join(options.outDir, `${pkg.manifest.name.replace('/', '__')}-${version}.tgz`)
      await repackTarball(file, output, (manifest) => rewriteManifest(manifest, version, versions))
      packages.push({file: output, name: pkg.manifest.name, version})
    }
    return {id, packages}
  } finally {
    await rm(rawDir, {force: true, recursive: true})
  }
}

async function readCached(dir: string): Promise<PackedVariant | null> {
  const path = join(dir, 'variant.json')
  if (!existsSync(path)) return null
  const variant: PackedVariant = JSON.parse(await readFile(path, 'utf8'))
  return variant.packages.every((p) => existsSync(p.file)) ? variant : null
}

async function writeCached(dir: string, variant: PackedVariant) {
  await writeFile(join(dir, 'variant.json'), `${JSON.stringify(variant, null, 2)}\n`)
}

/**
 * Builds and packs a git ref in a temporary worktree. Results are cached by
 * commit, so comparing against the same base again skips the build.
 */
export async function packRef(options: {
  label: string
  log: Log
  ref: string
  repoRoot: string
  stateDir: string
}): Promise<PackedVariant> {
  const {label, log, ref, repoRoot, stateDir} = options
  const {stdout: sha} = await execa('git', ['rev-parse', '--verify', `${ref}^{commit}`], {cwd: repoRoot})
  // Prefixed so the id is never all digits, which semver rejects with a leading zero
  const id = `g${sha.slice(0, 10)}`
  const outDir = join(stateDir, 'packs', id)

  const cached = await readCached(outDir)
  if (cached) {
    log(`Using cached packages for ${label} (${sha.slice(0, 7)})`)
    return {...cached, label}
  }

  // Outside the repo: inside it, module resolution from the worktree climbs
  // into this checkout's node_modules and the build picks up the wrong packages
  const worktree = join(tmpdir(), 'cold-start-bench-worktrees', id)
  await rm(worktree, {force: true, recursive: true})
  await execa('git', ['worktree', 'prune'], {cwd: repoRoot})
  log(`Building ${label} (${sha.slice(0, 7)}) in a temporary worktree`)
  await execa('git', ['worktree', 'add', '--detach', worktree, sha], {cwd: repoRoot})
  try {
    await execa('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], {cwd: worktree})
    await execa('pnpm', buildArgs(), {cwd: worktree})
    const {packages} = await packWorkspace({id, outDir, root: worktree})
    const variant: PackedVariant = {id, label, packages, sha}
    await writeCached(outDir, variant)
    return variant
  } finally {
    await execa('git', ['worktree', 'remove', '--force', worktree], {cwd: repoRoot, reject: false})
  }
}

/**
 * Builds and packs the checkout as it is on disk, uncommitted changes included.
 */
export async function packWorkingTree(options: {
  log: Log
  repoRoot: string
  stateDir: string
}): Promise<PackedVariant> {
  const {log, repoRoot, stateDir} = options
  log('Building the working tree')
  await execa('pnpm', buildArgs(), {cwd: repoRoot})

  const staging = join(stateDir, 'packs', 'staging')
  await rm(staging, {force: true, recursive: true})
  const {id, packages} = await packWorkspace({
    id: async (files) => `w${await hashFiles(files)}`,
    outDir: staging,
    root: repoRoot,
  })
  const outDir = join(stateDir, 'packs', id)
  await rm(outDir, {force: true, recursive: true})
  await rename(staging, outDir)
  const variant: PackedVariant = {
    id,
    label: 'working tree',
    packages: packages.map((p) => ({...p, file: p.file.replace(staging, outDir)})),
    sha: null,
  }
  await writeCached(outDir, variant)
  return variant
}

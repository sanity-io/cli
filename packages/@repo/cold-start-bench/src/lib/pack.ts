import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {execa} from 'execa'

import {
  benchVersion,
  packageClosure,
  type PackageManifest,
  rewriteManifest,
  type WorkspacePackage,
} from './manifest.ts'
import {hashFiles, repackTarball} from './tarball.ts'

/** What a new user installs: `sanity` pulls `@sanity/cli`, `npm create` pulls `create-sanity` */
const ROOT_PACKAGES = ['@sanity/cli', 'create-sanity']

export interface PackedPackage {
  file: string
  manifest: PackageManifest
}

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
 * Builds and packs the CLI packages in the checkout, uncommitted changes
 * included, then wraps the published `sanity@<sanityVersion>` around them.
 * Every package gets a bench version derived from the packed contents.
 */
export async function packWorkingTree(options: {
  outDir: string
  repoRoot: string
  sanityVersion: string
}): Promise<PackedPackage[]> {
  const {outDir, repoRoot, sanityVersion} = options
  // The same build tasks a release runs, for the packed packages and their workspace deps
  await execa(
    'pnpm',
    ['exec', 'turbo', 'run', 'build', 'build:types', ...ROOT_PACKAGES.map((name) => `--filter=${name}...`)],
    {cwd: repoRoot},
  )

  const closure = packageClosure(ROOT_PACKAGES, await readWorkspace(repoRoot))
  const rawDir = await mkdtemp(join(tmpdir(), 'cold-start-pack-'))
  try {
    const raw: string[] = []
    for (const pkg of closure) {
      // pnpm resolves `workspace:` and `catalog:` ranges and runs `prepack`
      const {stdout} = await execa('pnpm', ['pack', '--pack-destination', rawDir, '--json'], {
        cwd: pkg.path,
      })
      raw.push(JSON.parse(stdout.slice(stdout.indexOf('{'))).filename)
    }

    const sanityTarball = join(rawDir, 'sanity.tgz')
    const response = await fetch(`https://registry.npmjs.org/sanity/-/sanity-${sanityVersion}.tgz`)
    if (!response.ok) throw new Error(`Could not download sanity@${sanityVersion}: ${response.status}`)
    await writeFile(sanityTarball, Buffer.from(await response.arrayBuffer()))

    const hash = await hashFiles(raw)
    const versions = new Map(closure.map((p) => [p.manifest.name, benchVersion(p.manifest.version, hash)]))
    versions.set('sanity', benchVersion(sanityVersion, hash))

    await rm(outDir, {force: true, recursive: true})
    await mkdir(outDir, {recursive: true})
    const packed: PackedPackage[] = []
    for (const [input, name] of [
      ...raw.map((file, i) => [file, closure[i].manifest.name] as const),
      [sanityTarball, 'sanity'] as const,
    ]) {
      const version = versions.get(name)!
      const file = join(outDir, `${name.replace('/', '__')}-${version}.tgz`)
      const manifest = await repackTarball(input, file, (m) => rewriteManifest(m, version, versions))
      packed.push({file, manifest})
    }
    return packed
  } finally {
    await rm(rawDir, {force: true, recursive: true})
  }
}

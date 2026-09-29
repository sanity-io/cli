export interface PackageManifest {
  [key: string]: unknown
  name: string
  version: string

  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const RUNTIME_DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const

/**
 * Gives a package a bench version and pins its dependencies on other bench
 * packages to their exact bench versions, so each variant installs its own
 * build of every CLI package.
 */
export function rewriteManifest(
  manifest: PackageManifest,
  version: string,
  benchVersions: ReadonlyMap<string, string>,
): PackageManifest {
  const rewritten: PackageManifest = {...manifest, version}
  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    const deps = manifest[field]
    if (!deps) continue
    rewritten[field] = Object.fromEntries(
      Object.entries(deps).map(([name, range]) => [name, benchVersions.get(name) ?? range]),
    )
  }
  return rewritten
}

/**
 * Bench versions are ordinary releases with a patch number far above anything
 * published: `8.13.0` → `8.13.1000000000 + n`. Third-party ranges such as
 * `@sanity/runtime-cli`'s `@sanity/cli-core: ^3.7.0` then pick up the bench
 * build and npm dedupes the tree the way it would for a real release. A
 * prerelease (`8.13.0-bench.x`) would not match those ranges, and npm would
 * install the published package next to it.
 */
const BENCH_PATCH_BASE = 1_000_000_000

/**
 * `id` is a variant id such as `g1a2b3c4d5e` or `w0f9e8d7c6b`: a letter
 * followed by hex. Its first eight hex digits make the version unique.
 */
export function benchVersion(version: string, id: string): string {
  const match = /^(\d+)\.(\d+)\.\d+/.exec(version)
  if (!match) throw new Error(`Invalid version "${version}"`)
  const hex = /^[a-z]([\da-f]{8,})$/.exec(id)?.[1]
  if (!hex) throw new Error(`Invalid bench id "${id}"`)
  return `${match[1]}.${match[2]}.${BENCH_PATCH_BASE + Number.parseInt(hex.slice(0, 8), 16)}`
}

export function isBenchVersion(version: string): boolean {
  const patch = /^\d+\.\d+\.(\d+)/.exec(version)?.[1]
  return patch !== undefined && Number(patch) >= BENCH_PATCH_BASE
}

export interface WorkspacePackage {
  manifest: PackageManifest
  path: string
}

/**
 * The publishable workspace packages needed to install `roots`: the roots and
 * every workspace package they depend on at runtime, transitively.
 */
export function packageClosure(
  roots: readonly string[],
  workspace: ReadonlyMap<string, WorkspacePackage>,
): WorkspacePackage[] {
  const seen = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.shift()!
    if (seen.has(name)) continue
    const pkg = workspace.get(name)
    if (!pkg) throw new Error(`"${name}" is not a package in this workspace`)
    if (pkg.manifest.private) throw new Error(`"${name}" is private and can't be installed`)
    seen.add(name)
    for (const field of RUNTIME_DEPENDENCY_FIELDS) {
      for (const dep of Object.keys(pkg.manifest[field] ?? {})) {
        if (workspace.has(dep)) queue.push(dep)
      }
    }
  }
  return [...seen].toSorted().map((name) => workspace.get(name)!)
}

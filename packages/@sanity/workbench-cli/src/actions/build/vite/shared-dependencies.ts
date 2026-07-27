import fs from 'node:fs'
import path from 'node:path'

import {type PackageJson} from '@sanity/cli-core'

/**
 * Packages a workbench remote consumes from the host's share scope when a host
 * provides one, and bundles itself when none does.
 *
 * `react-dom` is missing on purpose. Module federation expands the bare key into
 * `react-dom/server` through its common-subpath table, and materialising that
 * share leaks a child-process handle: `sanity build` writes correct output,
 * reports success, then never exits. Reproduced on the module-federation vite
 * plugin 1.18.1 and 1.19.1, in any app whose graph reaches `react-dom/server`
 * (`sanity` does). Add it back once that's fixed upstream.
 */
const CANDIDATES = ['react', '@sanity/ui', '@sanity/sdk', '@sanity/sdk-react', 'styled-components']

/**
 * The `node_modules` directories Node would search from `fromDir`, nearest first.
 *
 * Walked by hand rather than through `require.resolve.paths`, which also appends
 * the global and `NODE_PATH` folders. Under pnpm that reaches the hidden hoisted
 * `.pnpm/node_modules`, where every transitive package looks locally installed.
 */
function nodeModulesChain(fromDir: string): string[] {
  const chain: string[] = []
  let dir = path.resolve(fromDir)
  for (;;) {
    if (path.basename(dir) !== 'node_modules') chain.push(path.join(dir, 'node_modules'))
    const parent = path.dirname(dir)
    if (parent === dir) return chain
    dir = parent
  }
}

/** Locate an installed package's directory, as resolved from `fromDir`. */
function packageDir(name: string, fromDir: string): string | undefined {
  for (const nodeModules of nodeModulesChain(fromDir)) {
    const dir = path.join(nodeModules, name)
    // Real path, so a pnpm symlink and its store target compare equal.
    if (fs.existsSync(path.join(dir, 'package.json'))) return fs.realpathSync(dir)
  }
  return undefined
}

function readPackage(dir: string): PackageJson | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch {
    return undefined
  }
}

/** The range within which a package keeps its export surface, per semver. */
function compatibleRange(version: string): string {
  const [major, minor] = version.split('.')
  return major === '0' ? `0.${minor}` : major
}

/**
 * The share map for an app's federation build: the candidates it actually has,
 * minus the ones sharing would break.
 *
 * A share key is per specifier, not per resolved version, so every import of a
 * package in the remote's graph is rewritten to one virtual module built from the
 * top-level copy. That makes two majors in the same tree unshareable: the other
 * major's consumers lose exports the top-level copy doesn't have (`@sanity/ui` v3
 * `ThemeProvider` under a v4 top-level copy fails the build outright). Module
 * federation can express this per module via `include`/`exclude` version filters,
 * but the vite plugin drops them as of 1.19.1, so the decision happens here.
 *
 * @internal
 */
export function deriveSharedDependencies(options: {
  pkgJson: PackageJson
  projectDir: string
}): Record<string, {requiredVersion?: string}> {
  const {pkgJson, projectDir} = options

  // All three fields: `@sanity/ui` is a types-only devDependency in apps that
  // resolve it from the host at runtime, and it still gets bundled.
  const declared = new Set([
    ...Object.keys(pkgJson.dependencies ?? {}),
    ...Object.keys(pkgJson.devDependencies ?? {}),
    ...Object.keys(pkgJson.peerDependencies ?? {}),
  ])

  // ponytail: only the app's direct dependencies are searched for a second copy.
  // A candidate nested deeper (a dependency of a dependency) is missed, and fails
  // the build loudly on a missing export rather than silently. Walk the full tree
  // if that shows up in practice.
  const dependencyDirs = [...declared]
    .map((name) => packageDir(name, projectDir))
    .filter((dir): dir is string => dir !== undefined)

  const selected = new Map<string, {dir: string; version: string}>()

  for (const name of CANDIDATES) {
    if (!declared.has(name)) continue

    const dir = packageDir(name, projectDir)
    // An unresolvable key still lands in the container init, which fails the build.
    if (!dir) continue
    const version = readPackage(dir)?.version
    if (!version) continue

    const hasOtherMajor = dependencyDirs.some((dependencyDir) => {
      const nested = packageDir(name, dependencyDir)
      if (!nested || nested === dir) return false
      const nestedVersion = readPackage(nested)?.version
      return (
        nestedVersion !== undefined && compatibleRange(nestedVersion) !== compatibleRange(version)
      )
    })
    if (hasOtherMajor) continue

    selected.set(name, {dir, version})
  }

  // Module federation drops a share that another share depends on, but only in
  // dev (initialisation order), which would leave dev and build with different
  // maps. `@sanity/sdk` under `@sanity/sdk-react` hits this. Drop it in both.
  for (const [name, {dir}] of selected) {
    for (const dependency of Object.keys(readPackage(dir)?.dependencies ?? {})) {
      if (dependency !== name) selected.delete(dependency)
    }
  }

  return Object.fromEntries(
    [...selected].map(([name, {version}]) => [
      name,
      // While `react-dom` stays bundled, react may only dedupe against an
      // identical copy: React requires the pair to be the same version, and the
      // default caret range would accept a host react its react-dom isn't built
      // against. Everything else takes module federation's default `^installed`.
      name === 'react' ? {requiredVersion: version} : {},
    ]),
  )
}

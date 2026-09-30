import {existsSync} from 'node:fs'
import {cp, mkdir, readdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join, relative, sep} from 'node:path'

import {init, parse} from 'cjs-module-lexer'
import {transform} from 'esbuild'

import {TOOLCHAIN_PACKAGES} from './toolchain-packages.js'

export interface Manifest {
  [key: string]: unknown
  name: string
  version: string

  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, {optional?: boolean}>
}

export interface ToolchainPackage {
  name: string
  version: string
}

function isBareOnlyDependency(pkg: Manifest, name: string): boolean {
  // These tar libraries use Node's built-in fs/path. Their Bare runtime
  // alternatives contain native binaries for every platform, unused by Node.
  if (pkg.name !== 'tar-fs' && pkg.name !== 'tar-stream') return false
  const imports = pkg.imports as Record<string, {bare?: string; default?: string}> | undefined
  return Object.entries(imports ?? {}).some(
    ([builtin, conditions]) =>
      (builtin === 'fs' || builtin === 'path') &&
      conditions.bare === name &&
      conditions.default === builtin,
  )
}

export function resolvePackage(name: string, from: string, stage: string): string | undefined {
  for (let dir = from; dir.startsWith(stage); dir = dirname(dir)) {
    const path = join(dir, 'node_modules', name)
    if (existsSync(join(path, 'package.json'))) return path
  }
  return undefined
}

async function compactFiles(dir: string, module: boolean) {
  if (existsSync(join(dir, 'package.json'))) {
    const pkg: Manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
    module = pkg.type === 'module'
  }
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      await compactFiles(path, module)
    } else if (/\.[cm]?js$/.test(entry.name)) {
      const code = await readFile(path, 'utf8')
      try {
        const result = await transform(code, {
          keepNames: true,
          legalComments: 'inline',
          minifyIdentifiers: true,
          minifySyntax: true,
          minifyWhitespace: true,
          target: 'node22',
        })
        const commonjs = entry.name.endsWith('.cjs') || (!module && entry.name.endsWith('.js'))
        if (commonjs) {
          // Node discovers named CJS exports from source syntax. Only compact
          // when its lexer sees exactly the same exports and re-export targets.
          const before = parse(code)
          const after = parse(result.code)
          if (JSON.stringify(before) !== JSON.stringify(after)) continue
        }
        await writeFile(path, result.code)
      } catch {
        // Packages can contain JS templates; preserve those assets verbatim.
      }
    }
  }
}

/** Embed portable dependencies and leave platform-specific packages to npm. */
export async function prepareDependencies(
  stage: string,
  output: string,
  dependencies: Record<string, string>,
  toolchains?: Map<string, ToolchainPackage>,
) {
  await init()
  const native: Record<string, string> = {}
  const optional: Record<string, string> = {}
  const seen = new Set<string>()
  const queue: {name: string; optional: boolean; owner: string; path: string}[] = []
  for (const name of Object.keys(dependencies)) {
    const path = resolvePackage(name, stage, stage)
    if (!path)
      throw new Error(`Missing production dependency ${name}. Run pnpm install and pack again.`)
    queue.push({name, optional: false, owner: '@sanity/cli', path})
  }
  while (queue.length > 0) {
    const entry = queue.shift()!
    if (!entry.optional && optional[entry.name]) {
      native[entry.name] = optional[entry.name]
      delete optional[entry.name]
    }
    if (seen.has(entry.path)) continue
    seen.add(entry.path)
    const pkg: Manifest = JSON.parse(await readFile(join(entry.path, 'package.json'), 'utf8'))
    // Workflows use their own client version. Keep the CLI's authentication
    // client immediate, and load the workflow-specific SDK with workflow tools.
    const workflowClient = entry.name === '@sanity/client' && entry.owner === '@sanity/workflow-cli'
    if ((TOOLCHAIN_PACKAGES.has(entry.name) || workflowClient) && toolchains) {
      toolchains.set(entry.path, {name: entry.name, version: pkg.version})
      continue
    }
    const platformSpecific = pkg.os || pkg.cpu
    const nativeWrapper = Object.keys(pkg.optionalDependencies ?? {}).some((name) =>
      /-(?:darwin|linux|win32|android|freebsd|aix|sunos)(?:-|$)/.test(name),
    )
    if (TOOLCHAIN_PACKAGES.has(entry.name) || platformSpecific || nativeWrapper) {
      const target = entry.optional ? optional : native
      if (target[entry.name] && target[entry.name] !== pkg.version) {
        throw new Error(
          `Conflicting native dependency versions for ${entry.name}. Align the dependency versions before packing.`,
        )
      }
      target[entry.name] = pkg.version
      continue
    }
    const dest = join(output, 'dist', relative(stage, entry.path))
    // RxJS publishes its development TypeScript sources alongside every
    // compiled distribution. Its runtime/type exports all point into dist.
    const omitRxjsSources =
      pkg.name === 'rxjs' && pkg.exports && !JSON.stringify(pkg.exports).includes('/src/')
    await mkdir(dirname(dest), {recursive: true})
    await cp(entry.path, dest, {
      dereference: true,
      filter: (file) =>
        !relative(entry.path, file).split(sep).includes('node_modules') &&
        !file.endsWith('.map') &&
        !(omitRxjsSources && relative(entry.path, file).split(sep)[0] === 'src'),
      recursive: true,
    })
    if (!pkg.name.startsWith('@sanity/cli') && pkg.name !== '@sanity/workbench-cli')
      await compactFiles(dest, pkg.type === 'module')
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies'] as const) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        if (isBareOnlyDependency(pkg, name)) continue
        if (field === 'peerDependencies' && pkg.peerDependenciesMeta?.[name]?.optional) continue
        const path = resolvePackage(name, entry.path, stage)
        if (!path) {
          if (field === 'optionalDependencies') continue
          throw new Error(
            `Missing ${name} required by ${pkg.name}. Run pnpm install and pack again.`,
          )
        }
        queue.push({
          name,
          optional: entry.optional || field === 'optionalDependencies',
          owner: pkg.name,
          path,
        })
      }
    }
  }

  return {dependencies: native, optionalDependencies: optional}
}

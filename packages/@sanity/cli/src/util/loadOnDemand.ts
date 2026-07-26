import {spawnSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {doImport} from '@sanity/cli-core'
import {packageDirectorySync} from 'package-directory'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * Load package that is not part of the bundled CLI's base install.
 * Resolution order:
 *
 *  1. Existing dependency: tries CLI first, falls back to studio project.
 *     Install is a no-op in both cases.
 *
 *  2. Bundled distribution: install the `package.json` `jitVersions`-pinned
 *     version in the shared, per-user cache (`~/.sanity/cli-jit`) and load it.
 *     Note: cache layout matches JIT stub commands in `oclif.manifest.json`,
 *     so both share one install.
 *
 * @param name - Package specifier to load (e.g. `@sanity/codegen`)
 * @param log - Optional callback invoked once if an on-demand install is needed
 * @returns The loaded module namespace
 * @internal
 */
export async function loadOnDemand<T>(name: string, log?: (message: string) => void): Promise<T> {
  try {
    // eslint-disable-next-line no-restricted-syntax
    return (await import(name)) as T
  } catch {
    // not installed alongside the CLI
  }

  const fromProject = tryResolveFrom(process.cwd(), name)
  if (fromProject) return doImport(fromProject) as Promise<T>

  const version = readPinnedVersion(name)
  if (!version) {
    throw new Error(
      `Unable to resolve "${name}" and no pinned version was recorded. Try: npm install -D ${name}`,
    )
  }
  const cacheKey = `${name.replaceAll('/', '__')}@${version.replaceAll(/[\^~]/g, '')}`
  const cacheDir = path.join(os.homedir(), '.sanity', 'cli-jit', cacheKey)

  let resolved = tryResolveFrom(cacheDir, name)
  if (!resolved) {
    log?.(`One-time setup: installing ${name}…`)
    const res = spawnSync(
      'npm',
      ['install', '--no-audit', '--no-fund', '--prefix', cacheDir, `${name}@${version}`],
      {stdio: ['ignore', 'ignore', 'inherit']},
    )
    if (res.status !== 0) {
      throw new Error(`Failed to install ${name}. Try: npm install -D ${name}`)
    }
    resolved = tryResolveFrom(cacheDir, name)
  }
  if (!resolved) {
    throw new Error(`Installed "${name}" into ${cacheDir} but could not resolve it`)
  }
  return doImport(resolved) as Promise<T>
}

function tryResolveFrom(dir: string, specifier: string): string | undefined {
  try {
    // `createRequire` needs a filepath, so we supply a synthetic one.
    const anchor = path.join(dir, '__cli_resolve_anchor__.js')
    return createRequire(anchor).resolve(specifier)
  } catch {
    return undefined
  }
}

function readPinnedVersion(name: string): string | undefined {
  const pkgDir = packageDirectorySync({cwd: HERE})
  if (!pkgDir) return undefined
  try {
    const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
    return pkg.jitVersions?.[name]
  } catch {
    return undefined
  }
}

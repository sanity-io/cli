import path from 'node:path'

import {getLocalPackageDir, readPackageJson} from '@sanity/cli-core/package-manager'
import {isStaging} from '@sanity/cli-core/util'

import {type PinnedImportMap} from './autoUpdates.js'
import {rewriteScopedPackage} from './getAutoUpdatesImportMap.js'

type PinnedPackage = {cssFile?: string; entries: string[]; name: string; version: string}

function getModulesBucketBase() {
  const host =
    process.env.SANITY_MODULES_BUCKET_HOST ||
    (isStaging() ? 'https://modules.sanity-cdn.work' : 'https://modules.sanity-cdn.com')
  return `${host}/modules/v1`
}

function isBucketEntrySubpath(subpath: string): boolean {
  if (subpath === './package.json') return false
  if (subpath.endsWith('.css')) return false
  if (subpath.includes('*')) return false
  return subpath.startsWith('.')
}

/**
 * Bucket entry names for a package's `exports`: `"."` is `index`, `"./<name>"` is `<name>`.
 * Packages without subpath exports only have `index`.
 *
 * @internal
 */
export function getBucketEntries(exports: unknown): string[] {
  const subpaths =
    typeof exports === 'object' && exports !== null
      ? Object.keys(exports).filter((subpath) => isBucketEntrySubpath(subpath))
      : []
  const entries = subpaths.map((subpath) => (subpath === '.' ? 'index' : subpath.slice(2)))
  return entries.length > 0 ? entries : ['index']
}

/**
 * Bucket entry names for the locally installed copy of a package. Throws for `sanity`, which
 * must be readable here; optional packages fall back to `index`.
 *
 * @internal
 */
export async function getInstalledBucketEntries(
  packageName: string,
  workDir: string,
): Promise<string[]> {
  try {
    const packageDir = getLocalPackageDir(packageName, workDir)
    const manifest = await readPackageJson(path.join(packageDir, 'package.json'), {
      skipSchemaValidation: true,
    })
    return getBucketEntries(manifest.exports)
  } catch (error) {
    if (packageName === 'sanity') {
      throw new Error(`Failed to read exports from the installed ${packageName} package`, {
        cause: error,
      })
    }
    return ['index']
  }
}

function getBucketFileUrl(pkg: PinnedPackage, fileName: string, bucketBase: string) {
  return `${bucketBase}/${rewriteScopedPackage(pkg.name)}/${pkg.version}/bare/${fileName}`
}

/**
 * Import map and stylesheets that load the exact given versions straight from the module
 * bucket, without going through Module Server.
 *
 * @internal
 */
export function getPinnedImportMap(
  packages: PinnedPackage[],
  options: {bucketBase?: string} = {},
): PinnedImportMap {
  const bucketBase = options.bucketBase || getModulesBucketBase()
  return {
    cssUrls: packages.flatMap((pkg) =>
      pkg.cssFile ? [getBucketFileUrl(pkg, pkg.cssFile, bucketBase)] : [],
    ),
    imports: Object.fromEntries(
      packages.flatMap((pkg) =>
        pkg.entries.map((entry) => [
          entry === 'index' ? pkg.name : `${pkg.name}/${entry}`,
          getBucketFileUrl(pkg, `${entry}.mjs`, bucketBase),
        ]),
      ),
    ),
  }
}

import {readFile} from 'node:fs/promises'
import path from 'node:path'

import {getLocalPackageDir, getLocalPackageVersion} from '@sanity/cli-core/package-manager'
import {gt, minVersion, rcompare, satisfies} from 'semver'

import {getCjsNamedExports} from './getCjsNamedExports.js'

/**
 * A type representing the imports of vendor packages, defining specific entry
 * points for various versions and subpaths of the packages.
 */
type VendorImports = {
  [packageName: string]: {
    [versionRange: string]: {
      [subpath: string]: string
    }
  }
}

// Define the vendor packages and their corresponding versions and entry points
const VENDOR_IMPORTS: VendorImports = {
  react: {
    '^19.2.0': {
      '.': './cjs/react.production.js',
      './compiler-runtime': './cjs/react-compiler-runtime.production.js',
      './jsx-dev-runtime': './cjs/react-jsx-dev-runtime.production.js',
      './jsx-runtime': './cjs/react-jsx-runtime.production.js',
      './package.json': './package.json',
    },
  },
  'react-dom': {
    '^19.2.0': {
      '.': './cjs/react-dom.production.js',
      './client': './cjs/react-dom-client.production.js',
      './package.json': './package.json',
      './server': './cjs/react-dom-server-legacy.browser.production.js',
      './server.browser': './cjs/react-dom-server-legacy.browser.production.js',
      './static': './cjs/react-dom-server.browser.production.js',
      './static.browser': './cjs/react-dom-server.browser.production.js',
    },
  },
}

const STYLED_COMPONENTS_IMPORTS = {
  'styled-components': {
    '^6.1.0': {
      '.': './dist/styled-components.browser.esm.js',
      './package.json': './package.json',
    },
  },
}

export interface VendorBuildConfig {
  /** Rolldown entry name -\> absolute path to the package entry file. */
  entries: Record<string, string>
  /** Named exports each CommonJS entry must re-expose as ESM, keyed by chunk name. */
  namesByChunkName: Record<string, readonly string[]>
  /** Rolldown entry chunk name -\> bare import specifier (e.g. `react`, `react-dom/client`). */
  specifiersByChunkName: Record<string, string>
}

interface ResolveVendorBuildConfigOptions {
  cwd: string
  isApp: boolean
}

/**
 * Resolves vendor package entry points and metadata for a combined studio/app build.
 * Does not run a build — callers add `entries` to the main Vite/Rolldown input and
 * derive the import map from emitted vendor chunks after the single `vite.build`.
 *
 * @internal
 */
export async function resolveVendorBuildConfig({
  cwd,
  isApp,
}: ResolveVendorBuildConfigOptions): Promise<VendorBuildConfig> {
  const entries: Record<string, string> = {}
  const namesByChunkName: Record<string, readonly string[]> = {}
  const specifiersByChunkName: Record<string, string> = {}

  const vendorImports = isApp ? VENDOR_IMPORTS : {...VENDOR_IMPORTS, ...STYLED_COMPONENTS_IMPORTS}

  for (const [packageName, ranges] of Object.entries(vendorImports)) {
    const version = await getLocalPackageVersion(packageName, cwd)
    if (!version) {
      throw new Error(`Could not get version for '${packageName}'`)
    }

    const sortedRanges = Object.keys(ranges).toSorted((range1, range2) => {
      const min1 = minVersion(range1)
      const min2 = minVersion(range2)

      if (!min1) throw new Error(`Could not parse range '${range1}'`)
      if (!min2) throw new Error(`Could not parse range '${range2}'`)

      return rcompare(min1.version, min2.version)
    })

    const matchedRange = sortedRanges.find((range) => satisfies(version, range))

    if (!matchedRange) {
      const min = minVersion(sortedRanges.at(-1)!)
      if (!min) {
        throw new Error(`Could not find a minimum version for package '${packageName}'`)
      }

      if (gt(min.version, version)) {
        throw new Error(`Package '${packageName}' requires at least ${min.version}.`)
      }

      throw new Error(`Version '${version}' of package '${packageName}' is not supported yet.`)
    }

    const subpaths = ranges[matchedRange]
    const packageDir = getLocalPackageDir(packageName, cwd)

    for (const [subpath, relativeEntryPoint] of Object.entries(subpaths)) {
      const specifier = path.posix.join(packageName, subpath)
      const chunkName = path.posix.join(
        packageName,
        path.relative(packageName, specifier) || 'index',
      )

      const entryPath = path.join(packageDir, relativeEntryPoint)
      entries[chunkName] = entryPath
      specifiersByChunkName[chunkName] = specifier

      if (packageName in VENDOR_IMPORTS && subpath !== './package.json') {
        const source = await readFile(entryPath, 'utf8')
        namesByChunkName[chunkName] = await getCjsNamedExports(source, chunkName)
      }
    }
  }

  return {entries, namesByChunkName, specifiersByChunkName}
}

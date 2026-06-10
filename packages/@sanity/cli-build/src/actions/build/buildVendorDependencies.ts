import path from 'node:path'

import {getLocalPackageDir, getLocalPackageVersion, readPackageJson} from '@sanity/cli-core'
import {gt, minVersion, rcompare, satisfies} from 'semver'
import {build, esmExternalRequirePlugin} from 'vite'

import {SANITY_CACHE_DIR} from '../../constants.js'
import {createExternalFromImportMap} from './createExternalFromImportMap.js'
import {getCjsNamedExports} from './getCjsNamedExports.js'
import {resolveCjsNamedExportsSource} from './resolveCjsNamedExportsSource.js'
import {
  resolveEntryPointPath,
  resolveVendorEntryPoints,
  type VendorEntryPoints,
  type VendorEntryPointStrategy,
} from './resolveVendorEntryPoints.js'
import {createVendorNamedExportsPlugin} from './vite/plugin-sanity-vendor-named-exports.js'

// Directory where vendor packages will be stored
const VENDOR_DIR = 'vendor'

/**
 * Supported version ranges for vendor packages whose entry points are resolved
 * from each package's `package.json` at build time.
 */
type VendorPackageRanges = {
  [packageName: string]: {
    [versionRange: string]: VendorEntryPointStrategy
  }
}

const VENDOR_PACKAGES: VendorPackageRanges = {
  react: {
    '^19.2.0': 'exports',
  },
  'react-dom': {
    '^19.2.0': 'exports',
  },
}

const STYLED_COMPONENTS_PACKAGES: VendorPackageRanges = {
  'styled-components': {
    '^6.1.0': 'browser-field',
  },
}

/** Packages whose entries are CommonJS and need the named-exports plugin. */
const CJS_VENDOR_PACKAGES = new Set(Object.keys(VENDOR_PACKAGES))

interface VendorBuildOptions {
  basePath: string
  cwd: string
  isApp: boolean
  outputDir: string
}

async function resolveSupportedEntryPoints(
  packageName: string,
  ranges: VendorPackageRanges[string],
  cwd: string,
): Promise<VendorEntryPoints> {
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

  const packageDir = getLocalPackageDir(packageName, cwd)
  const manifest = await readPackageJson(path.join(packageDir, 'package.json'), {
    skipSchemaValidation: true,
  })

  return resolveVendorEntryPoints({
    fallback: ranges[matchedRange],
    manifest,
    packageDir,
  })
}

/**
 * Builds the ESM browser compatible versions of the vendor packages
 * specified in VENDOR_PACKAGES. Returns the `imports` object of an import map.
 */
export async function buildVendorDependencies({
  basePath,
  cwd,
  isApp,
  outputDir,
}: VendorBuildOptions): Promise<Record<string, string>> {
  const entry: Record<string, string> = {}
  const imports: Record<string, string> = {}

  // Named exports each CommonJS entry must re-expose as ESM, keyed by chunk name.
  const namesByChunkName: Record<string, readonly string[]> = {}

  const vendorPackages = isApp
    ? VENDOR_PACKAGES
    : {...VENDOR_PACKAGES, ...STYLED_COMPONENTS_PACKAGES}

  for (const [packageName, ranges] of Object.entries(vendorPackages)) {
    const subpaths = await resolveSupportedEntryPoints(packageName, ranges, cwd)
    const packageDir = getLocalPackageDir(packageName, cwd)

    for (const [subpath, relativeEntryPoint] of Object.entries(subpaths)) {
      const specifier = path.posix.join(packageName, subpath)
      const chunkName = path.posix.join(
        packageName,
        path.relative(packageName, specifier) || 'index',
      )

      const entryPath = resolveEntryPointPath(packageDir, relativeEntryPoint)
      entry[chunkName] = entryPath
      imports[specifier] = path.posix.join('/', basePath, VENDOR_DIR, `${chunkName}.mjs`)

      // React and React-DOM ship CommonJS. Rolldown lowers a CJS entry to an ESM
      // chunk that only emits `export default`, so collect the named exports it
      // must additionally re-expose (see `createVendorNamedExportsPlugin`).
      // `styled-components` is native ESM and `package.json` is JSON, so both are
      // skipped here.
      if (CJS_VENDOR_PACKAGES.has(packageName) && subpath !== './package.json') {
        const source = await resolveCjsNamedExportsSource(packageDir, entryPath)
        namesByChunkName[chunkName] = await getCjsNamedExports(source, chunkName)
      }
    }
  }

  // Externals are handled by `esmExternalRequirePlugin` (below) rather than
  // `rolldownOptions.external`: the plugin both marks them external AND rewrites
  // CommonJS `require('react')` calls (e.g. in react-dom) into ESM imports.
  // Also setting `rolldownOptions.external` short-circuits that rewrite, leaving a
  // runtime `require` shim that throws in the browser.
  const external = createExternalFromImportMap({imports})

  // removes the `RolldownWatcher` type
  type BuildResult = Exclude<Awaited<ReturnType<typeof build>>, {close: unknown}>

  // Use Vite to build the packages into the output directory
  let buildResult = (await build({
    appType: 'custom',
    build: {
      emptyOutDir: false, // Rely on CLI to do this
      lib: {entry, formats: ['es']},
      minify: true,
      outDir: path.join(outputDir, VENDOR_DIR),
      rolldownOptions: {
        // Expose Rolldown's native MagicString on `renderChunk`'s `meta` so the
        // vendor named-exports plugin can edit chunks without a JS dependency.
        experimental: {nativeMagicString: true},
        output: {
          chunkFileNames: '[name]-[hash].mjs',
          entryFileNames: '[name]-[hash].mjs',
          exports: 'named',
          format: 'es',
        },
        treeshake: true,
      },
    },
    // Define a custom cache directory so that sanity's vite cache
    // does not conflict with any potential local vite projects
    cacheDir: `${SANITY_CACHE_DIR}/vite-vendor`,
    configFile: false,
    define: {'process.env.NODE_ENV': JSON.stringify('production')},
    logLevel: 'silent',
    mode: 'production',
    plugins: [
      // Re-expose CommonJS named exports (react, react-dom) as real ESM exports;
      // Rolldown only emits `export default` for a CommonJS entry.
      createVendorNamedExportsPlugin(namesByChunkName),
      // Rewrite external `require(...)` (e.g. react-dom requiring react) into ESM
      // imports so the vendored output runs in the browser without `require`.
      esmExternalRequirePlugin({external}),
    ],
    root: cwd,
  })) as BuildResult

  buildResult = Array.isArray(buildResult) ? buildResult : [buildResult]

  // Create a map of the original import specifiers to their hashed filenames
  const hashedImports: Record<string, string> = {}
  const output = buildResult.flatMap((i) => i.output)

  for (const chunk of output) {
    if (chunk.type === 'asset') continue

    for (const [specifier, originalPath] of Object.entries(imports)) {
      if (originalPath.endsWith(`${chunk.name}.mjs`)) {
        hashedImports[specifier] = path.posix.join('/', basePath, VENDOR_DIR, chunk.fileName)
      }
    }
  }

  return hashedImports
}

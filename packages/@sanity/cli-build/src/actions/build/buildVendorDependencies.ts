import path from 'node:path'

import {build, esmExternalRequirePlugin} from 'vite'

import {SANITY_CACHE_DIR} from '../../constants.js'
import {VENDOR_DIR} from './constants.js'
import {createExternalFromImportMap} from './createExternalFromImportMap.js'
import {resolveVendorBuildConfig} from './resolveVendorBuildConfig.js'
import {createVendorNamedExportsPlugin} from './vite/plugin-sanity-vendor-named-exports.js'

interface VendorBuildOptions {
  basePath: string
  cwd: string
  isApp: boolean
  outputDir: string
}

/**
 * Builds the ESM browser compatible versions of the vendor packages
 * specified in VENDOR_IMPORTS. Returns the `imports` object of an import map.
 *
 * @deprecated Prefer resolving {@link resolveVendorBuildConfig} and building
 * vendor chunks as part of the main studio/app Vite build.
 * @internal
 */
export async function buildVendorDependencies({
  basePath,
  cwd,
  isApp,
  outputDir,
}: VendorBuildOptions): Promise<Record<string, string>> {
  const {entries, namesByChunkName, specifiersByChunkName} = await resolveVendorBuildConfig({
    cwd,
    isApp,
  })

  const placeholderImports = Object.fromEntries(
    Object.entries(specifiersByChunkName).map(([chunkName, specifier]) => [
      specifier,
      path.posix.join('/', basePath, VENDOR_DIR, `${chunkName}.mjs`),
    ]),
  )

  const external = createExternalFromImportMap({imports: placeholderImports})

  type BuildResult = Exclude<Awaited<ReturnType<typeof build>>, {close: unknown}>

  let buildResult = (await build({
    appType: 'custom',
    build: {
      emptyOutDir: false,
      lib: {entry: entries, formats: ['es']},
      minify: true,
      outDir: path.join(outputDir, VENDOR_DIR),
      rolldownOptions: {
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
    cacheDir: `${SANITY_CACHE_DIR}/vite-vendor`,
    configFile: false,
    define: {'process.env.NODE_ENV': JSON.stringify('production')},
    logLevel: 'silent',
    mode: 'production',
    plugins: [
      createVendorNamedExportsPlugin(namesByChunkName),
      esmExternalRequirePlugin({external}),
    ],
    root: cwd,
  })) as BuildResult

  buildResult = Array.isArray(buildResult) ? buildResult : [buildResult]

  const hashedImports: Record<string, string> = {}
  const output = buildResult.flatMap((result) => result.output)

  for (const chunk of output) {
    if (chunk.type === 'asset') continue

    const specifier = specifiersByChunkName[chunk.name]
    if (!specifier) continue

    hashedImports[specifier] = path.posix.join('/', basePath, VENDOR_DIR, chunk.fileName)
  }

  return hashedImports
}

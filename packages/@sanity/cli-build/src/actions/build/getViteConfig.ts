import path from 'node:path'

import babel from '@rolldown/plugin-babel'
import {
  type CliConfig,
  findProjectRoot,
  getCliTelemetry,
  readPackageJson,
  type UserViteConfig,
} from '@sanity/cli-core'
import viteReact, {reactCompilerPreset} from '@vitejs/plugin-react'
import {type PluginOptions as ReactCompilerConfig} from 'babel-plugin-react-compiler'
import debug from 'debug'
import {
  type ConfigEnv,
  esmExternalRequirePlugin,
  type InlineConfig,
  mergeConfig,
  type Plugin,
  type PluginOption,
  type Rolldown,
} from 'vite'

import {SANITY_CACHE_DIR} from '../../constants.js'
import {type ServiceArtifact} from '../../workbench/services/artifact.js'
import {type InterfaceArtifact} from '../../workbench/views/artifact.js'
import {federation as viteFederation} from '../../workbench/vite/plugin.js'
import {sanitySchemaExtractionPlugin} from '../schema/vite/plugin-schema-extraction.js'
import {type AutoUpdatesBuildConfig} from './autoUpdates.js'
import {VENDOR_DIR} from './constants.js'
import {createExternalFromImportMap} from './createExternalFromImportMap.js'
import {normalizeBasePath} from './normalizeBasePath.js'
import {sanityBuildEntries} from './vite/plugin-sanity-build-entries.js'
import {sanityFaviconsPlugin} from './vite/plugin-sanity-favicons.js'
import {sanityRuntimeRewritePlugin} from './vite/plugin-sanity-runtime-rewrite.js'
import {createVendorNamedExportsPlugin} from './vite/plugin-sanity-vendor-named-exports.js'
import {getDefaultFaviconsPath} from './writeFavicons.js'

interface ViteOptions extends Pick<CliConfig, 'schemaExtraction'> {
  /**
   * Root path of the studio/sanity app
   */
  cwd: string

  entries: {
    relativeConfigLocation: string | null
    // `null` when a branded app declares no `entry` (sanity-io/workbench spec 002-workbench-extension-api, US5) — no app view.
    relativeEntry: string | null
  }

  /**
   * Returns the environment variables to be injected into the config.
   */
  getEnvironmentVariables(): Record<string, string>

  /**
   * Mode to run vite in - eg development or production
   */
  mode: 'development' | 'production'

  reactCompiler: ReactCompilerConfig | undefined

  /**
   * Additional plugins when configured, eg. typegen
   */
  additionalPlugins?: Plugin[]

  /**
   * Auto-updates configuration (production builds only). When set, vendor
   * packages are emitted as hashed ESM chunks by this build and the import map
   * in `index.html` is derived from the build output.
   */
  autoUpdates?: AutoUpdatesBuildConfig

  /**
   * Base path (eg under where to serve the app - `/studio` or similar)
   * Will be normalized to ensure it starts and ends with a `/`
   */
  basePath?: string

  isApp?: boolean

  /**
   * Whether this is a workbench app (opted in via `unstable_defineApp`). Drives
   * the module-federation build — replaces the old `federation.enabled` flag.
   */
  isWorkbenchApp?: boolean

  /**
   * Whether or not to minify the output (only used in `mode: 'production'`)
   */
  minify?: boolean

  /**
   * Output directory (eg where to place the built files, if any)
   */
  outputDir?: string
  /**
   * HTTP development server configuration
   */
  server?: {host?: string; port?: number}
  /**
   * Background services the workbench app declares. Built into self-contained
   * worker bundles and exposed through module federation as `./services/<name>`.
   */
  services?: readonly ServiceArtifact[]

  /**
   * Whether or not to enable source maps
   */
  sourceMap?: boolean

  /**
   * Views the workbench app declares. Built into render-contract artifacts and
   * exposed through module federation as `./views/<name>`.
   */
  views?: readonly InterfaceArtifact[]
}

/**
 * Get a configuration object for Vite based on the passed options
 *
 * @internal Only meant for consumption inside of Sanity modules, do not depend on this externally
 */
export async function getViteConfig(options: ViteOptions): Promise<InlineConfig> {
  const {
    additionalPlugins,
    autoUpdates,
    basePath: rawBasePath = '/',
    cwd,
    entries,
    isApp,
    isWorkbenchApp,
    minify,
    mode,
    outputDir,
    reactCompiler,
    schemaExtraction,
    server,
    services,
    // default to `true` when `mode=development`
    sourceMap = options.mode === 'development',
    views,
  } = options

  const basePath = normalizeBasePath(rawBasePath)

  const configPath = (await findProjectRoot(cwd)).path

  const customFaviconsPath = path.join(cwd, 'static')
  const defaultFaviconsPath = await getDefaultFaviconsPath()
  const staticPath = `${basePath}static`

  const envVars = options.getEnvironmentVariables()

  const sharedPlugins: PluginOption = [
    viteReact(),
    ...(reactCompiler ? [babel({presets: [reactCompilerPreset(reactCompiler)]})] : []),
    ...(schemaExtraction?.enabled
      ? [
          sanitySchemaExtractionPlugin({
            additionalPatterns: schemaExtraction.watchPatterns,
            configPath,
            enforceRequiredFields: schemaExtraction.enforceRequiredFields,
            outputPath: schemaExtraction.path,
            telemetryLogger: getCliTelemetry(),
            workDir: cwd,
            workspaceName: schemaExtraction.workspace,
          }),
        ]
      : []),
  ]

  const viteConfig: InlineConfig = {
    base: basePath,
    build: {
      outDir: outputDir || path.resolve(cwd, 'dist'),
      sourcemap: sourceMap,
    },
    // Define a custom cache directory so that sanity's vite cache
    // does not conflict with any potential local vite projects
    cacheDir: `${SANITY_CACHE_DIR}/vite`,
    configFile: false,
    define: {
      __SANITY_BUILD_TIMESTAMP__: JSON.stringify(Date.now()),
      __SANITY_STAGING__: process.env.SANITY_INTERNAL_ENV === 'staging',
      'process.env.MODE': JSON.stringify(mode),
      'process.env.PKG_BUILD_VERSION': JSON.stringify(process.env.PKG_BUILD_VERSION),
      /**
       * Yes, double negatives are confusing.
       * The default value of `SC_DISABLE_SPEEDY` is `process.env.NODE_ENV === 'production'`: https://github.com/styled-components/styled-components/blob/99c02f52d69e8e509c0bf012cadee7f8e819a6dd/packages/styled-components/src/constants.ts#L34
       * Which means that in production, use the much faster way of inserting CSS rules, based on the CSSStyleSheet API (https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet/insertRule)
       * while in dev mode, use the slower way of inserting CSS rules, which appends text nodes to the `<style>` tag: https://github.com/styled-components/styled-components/blob/99c02f52d69e8e509c0bf012cadee7f8e819a6dd/packages/styled-components/src/sheet/Tag.ts#L74-L76
       * There are historical reasons for this, primarily that browsers initially did not support editing CSS rules in the DevTools inspector if `CSSStyleSheet.insetRule` were used.
       * However, that's no longer the case (since Chrome 81 back in April 2020: https://developer.chrome.com/docs/css-ui/css-in-js), the latest version of FireFox also supports it,
       * and there is no longer any reason to use the much slower method in dev mode.
       */
      'process.env.SC_DISABLE_SPEEDY': JSON.stringify('false'),
      ...envVars,
    },
    envPrefix: isApp ? 'SANITY_APP_' : 'SANITY_STUDIO_',
    logLevel: mode === 'production' ? 'silent' : 'info',
    mode,
    plugins: [
      // Federation builds only need the federation plugin — skip client-specific
      // plugins (favicons, runtime rewrite, build entries)
      ...(isWorkbenchApp
        ? [
            ...sharedPlugins,
            viteFederation({
              ...(isApp
                ? {
                    // `null` relativeEntry (a branded app with no `entry`, sanity-io/workbench spec 002-workbench-extension-api, US5)
                    // → omit `appEntry` so the plugin exposes no `./App`.
                    ...(entries.relativeEntry ? {appEntry: entries.relativeEntry} : {}),
                    isApp: true as const,
                  }
                : {
                    isApp: false as const,
                    // TODO: fix this non-null assertion
                    studioConfigPath: entries.relativeConfigLocation!,
                  }),
              pkgJson: await readPackageJson(path.join(cwd, 'package.json')),
              services,
              views,
              workDir: cwd,
            }),
          ]
        : [
            ...sharedPlugins,
            sanityFaviconsPlugin({
              customFaviconsPath,
              defaultFaviconsPath,
              staticUrlPath: staticPath,
            }),
            sanityRuntimeRewritePlugin(),
            sanityBuildEntries({autoUpdates, basePath, cwd, isApp}),
            ...(additionalPlugins || []),
          ]),
    ],
    resolve: {
      dedupe: ['react', 'react-dom', 'sanity', 'styled-components'],
      // Honor the studio's tsconfig `paths`, consistent with studioWorkerLoader.worker.ts.
      tsconfigPaths: true,
    },
    root: cwd,
    server: {
      host: server?.host,
      port: server?.port || 3333,
      // Apps drift to a free port (the reported URL embeds whichever port was
      // claimed), and workbench runs stack servers on adjacent ports — both
      // need the fallback. Studios fail fast on a busy port.
      strictPort: !isApp && !isWorkbenchApp,

      /**
       * Significantly speed up startup time,
       * and most importantly eliminates the `new dependencies optimized: foobar. optimized dependencies changed. reloading`
       * types of initial reload loops that otherwise happen as vite discovers deps that need to be optimized.
       * This option starts the traversal up front, and warms up the dep tree required to render the userland sanity.config.ts file,
       * and thus avoids frustrating reload loops.
       */
      warmup: {
        clientFiles: ['./.sanity/runtime/app.js'],
      },
    },
  }

  // Federation builds don't produce a client bundle — the federation
  // plugin configures its own environment and build entry point.
  if (mode === 'production' && !isWorkbenchApp) {
    if (autoUpdates) {
      viteConfig.plugins!.push(
        // Re-expose CommonJS named exports (react, react-dom) as real ESM exports
        // on the emitted vendor chunks; Rolldown only emits `export default` for a
        // CommonJS entry.
        createVendorNamedExportsPlugin(autoUpdates.vendor.namesByChunkName),
        // The import map and vendor specifiers are externals of the studio/app
        // bundle, resolved by the browser at runtime. They are handed to
        // `esmExternalRequirePlugin` rather than `rolldownOptions.external`: the
        // plugin both marks them external AND rewrites bundled CommonJS
        // `require()` calls of an external (e.g. react-dom requiring react) into
        // ESM imports, while `rolldownOptions.external` would short-circuit that
        // rewrite and leave a runtime `require` shim that throws in the browser.
        esmExternalRequirePlugin({
          external: createExternalFromImportMap({
            imports: {
              ...autoUpdates.imports,
              ...Object.fromEntries(
                Object.values(autoUpdates.vendor.specifiersByChunkName).map((specifier) => [
                  specifier,
                  '',
                ]),
              ),
            },
          }),
        }),
      )
    }

    const vendorChunkNames = autoUpdates
      ? new Set(Object.keys(autoUpdates.vendor.specifiersByChunkName))
      : null

    viteConfig.build = {
      ...viteConfig.build,

      assetsDir: 'static',
      emptyOutDir: false, // Rely on CLI to do this
      minify: minify ? 'oxc' : false,

      rolldownOptions: {
        input: {
          sanity: path.join(cwd, '.sanity', 'runtime', 'app.js'),
          ...autoUpdates?.vendor.entries,
        },
        onwarn: onRolldownWarn,
        ...(autoUpdates
          ? {
              // Expose Rolldown's native MagicString on `renderChunk`'s `meta` so
              // the vendor named-exports plugin can edit chunks without a JS
              // dependency.
              experimental: {nativeMagicString: true},
              output: {
                entryFileNames: (chunk) =>
                  vendorChunkNames!.has(chunk.name)
                    ? `${VENDOR_DIR}/[name]-[hash].mjs`
                    : 'static/[name]-[hash].js',
                exports: 'named',
              },
              // App-style builds default to `preserveEntrySignatures: false`, which
              // treeshakes the exports off entry chunks. Vendor chunks are loaded by
              // the browser via the import map, so their exports must survive (e.g.
              // styled-components' native ESM exports). `exports-only` keeps exports
              // for entries that have them, while the export-less `sanity` app entry
              // still bundles as before.
              preserveEntrySignatures: 'exports-only',
            }
          : {}),
      },
    }
  }

  return viteConfig
}

function onRolldownWarn(warning: Rolldown.RolldownLog, warn: Rolldown.LoggingFunction) {
  if (suppressUnusedImport(warning)) {
    return
  }

  warn(warning)
}

function suppressUnusedImport(warning: Rolldown.RolldownLog & {ids?: string[]}): boolean {
  if (warning.code !== 'UNUSED_EXTERNAL_IMPORT') return false

  // Suppress:
  // ```
  // "useDebugValue" is imported from external module "react"…
  // ```
  if (warning.names?.includes('useDebugValue')) {
    warning.names = warning.names.filter((n) => n !== 'useDebugValue')
    if (warning.names.length === 0) return true
  }

  // If some library does something unexpected, we suppress since it isn't actionable
  if (warning.ids?.every((id) => id.includes('/node_modules/') || id.includes('\\node_modules\\')))
    return true

  return false
}

/**
 * Re-asserts the critical parts of the default config after a userland vite
 * config (`vite` in `sanity.cli.ts`) has been applied.
 *
 * Everything `getViteConfig` sets under `build.rolldownOptions` is load-bearing:
 * the `input` entries (the studio entry plus, for auto-updating studios/apps,
 * the vendor entries), `preserveEntrySignatures`, the `experimental` flags the
 * vendor plugins rely on, and the `output` chunk naming. A userland config that
 * returns a brand-new object for any of these would silently break the build
 * (e.g. vendor chunks never emitted while the bundle still treats them as
 * external), so the default `rolldownOptions` are deep-merged back over the
 * userland config: userland additions survive, replacements of critical
 * options are healed.
 *
 * @param config - User-modified configuration
 * @param defaultConfig - The configuration produced by `getViteConfig`, before the userland config was applied
 * @returns Merged configuration
 * @internal
 */
export async function finalizeViteConfig(
  config: InlineConfig,
  defaultConfig: InlineConfig,
): Promise<InlineConfig> {
  if (typeof config.build?.rolldownOptions?.input !== 'object') {
    throw new TypeError(
      'Vite config must contain `build.rolldownOptions.input`, and it must be an object',
    )
  }

  if (!config.root) {
    throw new Error(
      'Vite config must contain `root` property, and must point to the Sanity root directory',
    )
  }

  return mergeConfig(config, {
    build: {
      rolldownOptions: defaultConfig.build?.rolldownOptions ?? {},
    },
  })
}

/**
 * Merge user-provided Vite configuration object or function
 *
 * @param defaultConfig - Default configuration object
 * @param userConfig - User-provided configuration object or function
 * @returns Merged configuration
 * @internal
 */
export async function extendViteConfigWithUserConfig(
  env: ConfigEnv,
  defaultConfig: InlineConfig,
  userConfig: UserViteConfig,
): Promise<InlineConfig> {
  let config = defaultConfig

  if (typeof userConfig === 'function') {
    debug('Extending vite config using user-specified function')
    config = await userConfig(config, env)
  } else if (typeof userConfig === 'object') {
    debug('Merging vite config using user-specified object')
    config = mergeConfig(config, userConfig)
  }

  return config
}

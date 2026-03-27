import path from 'node:path'

import {
  type CliConfig,
  findProjectRoot,
  getCliTelemetry,
  readPackageJson,
  type UserViteConfig,
} from '@sanity/cli-core'
import {federation as viteFederation} from '@sanity/federation/vite'
import viteReact from '@vitejs/plugin-react'
import {type PluginOptions as ReactCompilerConfig} from 'babel-plugin-react-compiler'
import debug from 'debug'
import {readPackageUp} from 'read-package-up'
import {type ConfigEnv, type InlineConfig, mergeConfig, type Rollup} from 'vite'

import {sanityBuildEntries} from '../../server/vite/plugin-sanity-build-entries.js'
import {sanityFaviconsPlugin} from '../../server/vite/plugin-sanity-favicons.js'
import {sanityRuntimeRewritePlugin} from '../../server/vite/plugin-sanity-runtime-rewrite.js'
import {sanitySchemaExtractionPlugin} from '../../server/vite/plugin-schema-extraction.js'
import {sanityTypegenPlugin} from '../../server/vite/plugin-typegen.js'
import {createExternalFromImportMap} from './createExternalFromImportMap.js'
import {
  getAppEnvironmentVariables,
  getStudioEnvironmentVariables,
} from './getStudioEnvironmentVariables.js'
import {normalizeBasePath} from './normalizeBasePath.js'

interface ViteOptions extends Pick<CliConfig, 'federation' | 'schemaExtraction' | 'typegen'> {
  /**
   * Root path of the studio/sanity app
   */
  cwd: string

  /**
   * Mode to run vite in - eg development or production
   */
  mode: 'development' | 'production'

  reactCompiler: ReactCompilerConfig | undefined

  /**
   * Base path (eg under where to serve the app - `/studio` or similar)
   * Will be normalized to ensure it starts and ends with a `/`
   */
  basePath?: string

  importMap?: {imports?: Record<string, string>}

  isApp?: boolean

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
   * Whether or not to enable source maps
   */
  sourceMap?: boolean
}

/**
 * Get a configuration object for Vite based on the passed options
 *
 * @internal Only meant for consumption inside of Sanity modules, do not depend on this externally
 */
export async function getViteConfig(options: ViteOptions): Promise<InlineConfig> {
  const {
    basePath: rawBasePath = '/',
    cwd,
    federation,
    importMap,
    isApp,
    minify,
    mode,
    outputDir,
    reactCompiler,
    schemaExtraction,
    server,
    // default to `true` when `mode=development`
    sourceMap = options.mode === 'development',
    typegen,
  } = options

  const basePath = normalizeBasePath(rawBasePath)

  const sanityCliPkgPath = (await readPackageUp({cwd: import.meta.dirname}))?.path
  if (!sanityCliPkgPath) {
    throw new Error('Unable to resolve `@sanity/cli` module root')
  }

  const configPath = (await findProjectRoot(cwd)).path

  const customFaviconsPath = path.join(cwd, 'static')
  const defaultFaviconsPath = path.join(path.dirname(sanityCliPkgPath), 'static', 'favicons')
  const staticPath = `${basePath}static`

  const envVars = isApp
    ? getAppEnvironmentVariables({jsonEncode: true, prefix: 'process.env.'})
    : getStudioEnvironmentVariables({jsonEncode: true, prefix: 'process.env.'})

  const viteConfig: InlineConfig = {
    base: basePath,
    build: {
      outDir: outputDir || path.resolve(cwd, 'dist'),
      sourcemap: sourceMap,
    },
    // Define a custom cache directory so that sanity's vite cache
    // does not conflict with any potential local vite projects
    cacheDir: 'node_modules/.sanity/vite',
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
      viteReact(
        reactCompiler
          ? {
              babel: {
                generatorOpts: {compact: true},
                plugins: [['babel-plugin-react-compiler', reactCompiler]],
              },
            }
          : {},
      ),
      sanityFaviconsPlugin({customFaviconsPath, defaultFaviconsPath, staticUrlPath: staticPath}),
      sanityRuntimeRewritePlugin(),
      sanityBuildEntries({basePath, cwd, importMap, isApp}),
      // Add schema extraction when enabled
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
      // Add typegen when enabled
      ...(typegen?.enabled
        ? [
            sanityTypegenPlugin({
              config: typegen,
              telemetryLogger: getCliTelemetry(),
              workDir: cwd,
            }),
          ]
        : []),
      ...(federation?.enabled
        ? [
            viteFederation({
              isApp,
              pkgJson: await readPackageJson(path.join(cwd, 'package.json')),
              workDir: cwd,
            }),
          ]
        : []),
    ],
    resolve: {
      dedupe: ['react', 'react-dom', 'sanity', 'styled-components'],
    },
    root: cwd,
    server: {
      host: server?.host,
      port: server?.port || 3333,
      // Only enable strict port for studio,
      // since apps can run on any port
      strictPort: isApp ? false : true,

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

  if (mode === 'production') {
    viteConfig.build = {
      ...viteConfig.build,

      assetsDir: 'static',
      emptyOutDir: false, // Rely on CLI to do this
      minify: minify ? 'esbuild' : false,

      rollupOptions: {
        external: createExternalFromImportMap(importMap),
        input: {
          sanity: path.join(cwd, '.sanity', 'runtime', 'app.js'),
        },
        onwarn: onRollupWarn,
      },
    }
  }

  return viteConfig
}

function onRollupWarn(warning: Rollup.RollupLog, warn: Rollup.LoggingFunction) {
  if (suppressUnusedImport(warning)) {
    return
  }

  warn(warning)
}

function suppressUnusedImport(warning: Rollup.RollupLog & {ids?: string[]}): boolean {
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
 * Ensure Sanity entry chunk is always loaded
 *
 * @param config - User-modified configuration
 * @returns Merged configuration
 * @internal
 */
export async function finalizeViteConfig(config: InlineConfig): Promise<InlineConfig> {
  if (typeof config.build?.rollupOptions?.input !== 'object') {
    throw new TypeError(
      'Vite config must contain `build.rollupOptions.input`, and it must be an object',
    )
  }

  if (!config.root) {
    throw new Error(
      'Vite config must contain `root` property, and must point to the Sanity root directory',
    )
  }

  return mergeConfig(config, {
    build: {
      rollupOptions: {
        input: {
          sanity: path.join(config.root, '.sanity', 'runtime', 'app.js'),
        },
      },
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

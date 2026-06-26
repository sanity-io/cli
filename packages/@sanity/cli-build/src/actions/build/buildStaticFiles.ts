import path from 'node:path'

import {type CliConfig, type UserViteConfig} from '@sanity/cli-core'
import {type DefineAppInput} from '@sanity/workbench-cli'
import {type PluginOptions as ReactCompilerConfig} from 'babel-plugin-react-compiler'
import {build, createBuilder} from 'vite'

import {copyDir} from '../../util/copyDir.js'
import {type AutoUpdatesBuildConfig} from './autoUpdates.js'
import {buildDebug} from './buildDebug.js'
import {
  getAppEnvironmentVariables,
  getStudioEnvironmentVariables,
} from './getEnvironmentVariables.js'
import {extendViteConfigWithUserConfig, finalizeViteConfig, getViteConfig} from './getViteConfig.js'
import {writeFavicons} from './writeFavicons.js'
import {resolveEntries, writeSanityRuntime} from './writeSanityRuntime.js'

export interface ChunkModule {
  name: string
  renderedLength: number
}

export interface ChunkStats {
  modules: ChunkModule[]
  name: string
}

interface StaticBuildOptions {
  basePath: string
  cwd: string
  outputDir: string

  appTitle?: string
  autoUpdates?: AutoUpdatesBuildConfig
  entry?: string
  isApp?: boolean
  /** Workbench app (opted in via `unstable_defineApp`) — drives the federation build. */
  isWorkbenchApp?: boolean
  minify?: boolean
  profile?: boolean
  reactCompiler?: ReactCompilerConfig
  schemaExtraction?: CliConfig['schemaExtraction']
  services?: DefineAppInput['services']
  sourceMap?: boolean
  views?: DefineAppInput['views']
  vite?: UserViteConfig
}

/**
 * Builds static files
 *
 * @internal
 */
export async function buildStaticFiles(
  options: StaticBuildOptions,
): Promise<{chunks: ChunkStats[]}> {
  const {
    appTitle,
    autoUpdates,
    basePath,
    cwd,
    entry,
    isApp,
    isWorkbenchApp,
    minify = true,
    outputDir,
    reactCompiler,
    schemaExtraction,
    services,
    sourceMap = false,
    views,
    vite: extendViteConfig,
  } = options

  const mode = 'production'

  /* Federation builds only produce the federation environment
   * (remote-entry, mf-manifest) — skip client-specific steps like
   * runtime generation, static file copies, and favicons.
   */
  if (isWorkbenchApp) {
    buildDebug('Resolving entries for federation build')
    const entries = await resolveEntries({cwd, entry, isApp, isWorkbenchApp})

    buildDebug('Resolving vite config (federation)')
    let viteConfig = await getViteConfig({
      basePath,
      cwd,
      entries,
      getEnvironmentVariables,
      isApp,
      isWorkbenchApp,
      minify,
      mode,
      outputDir,
      reactCompiler,
      // Schema extraction is a build-time artifact, not a client-specific step,
      // so a federated studio extracts its schema like the legacy studio build.
      schemaExtraction,
      services,
      sourceMap,
      views,
    })

    // Apply the user's Vite config so plugins like `@vanilla-extract/vite-plugin`
    // transform source files before the federation environment is bundled.
    // `finalizeViteConfig` is intentionally skipped: the federation environment
    // has its own entry and does not use `.sanity/runtime/app.js`.
    if (extendViteConfig) {
      viteConfig = await extendViteConfigWithUserConfig(
        {command: 'build', mode},
        viteConfig,
        extendViteConfig,
      )
    }

    buildDebug('Bundling federation environment')
    const builder = await createBuilder(viteConfig)
    await builder.buildApp()
    buildDebug('Bundling complete')
    // TODO: add stats here
    return {chunks: []}
  }

  buildDebug('Writing Sanity runtime files')
  const {entries} = await writeSanityRuntime({
    appTitle,
    basePath,
    cwd,
    entry,
    isApp,
    isWorkbenchApp,
    reactStrictMode: false,
    watch: false,
  })

  function getEnvironmentVariables() {
    return isApp
      ? getAppEnvironmentVariables({jsonEncode: true, prefix: 'process.env.'})
      : getStudioEnvironmentVariables({jsonEncode: true, prefix: 'process.env.'})
  }

  buildDebug('Resolving vite config')
  let viteConfig = await getViteConfig({
    autoUpdates,
    basePath,
    cwd,
    entries,
    getEnvironmentVariables,
    isApp,
    isWorkbenchApp,
    minify,
    mode,
    outputDir,
    reactCompiler,
    schemaExtraction,
    sourceMap,
  })

  if (extendViteConfig) {
    const defaultViteConfig = viteConfig
    viteConfig = await extendViteConfigWithUserConfig(
      {command: 'build', mode},
      viteConfig,
      extendViteConfig,
    )
    viteConfig = await finalizeViteConfig(viteConfig, defaultViteConfig)
  }

  const fromPath = path.join(cwd, 'static')
  // Copy files placed in /static to the built /static
  buildDebug(`Copying static files from ${fromPath} to output dir`)
  const staticPath = path.join(outputDir, 'static')
  await copyDir(fromPath, staticPath)

  // Write favicons, not overwriting ones that already exist, to static folder
  buildDebug('Writing favicons to output dir')
  const faviconBasePath = `${basePath.replace(/\/+$/, '')}/static`
  await writeFavicons(faviconBasePath, staticPath)

  buildDebug('Bundling using vite')
  const bundle = await build(viteConfig)
  buildDebug('Bundling complete')

  // For typescript only - this shouldn't ever be the case given we're not watching
  if (Array.isArray(bundle) || !('output' in bundle)) {
    return {chunks: []}
  }

  const stats: ChunkStats[] = []
  for (const chunk of bundle.output) {
    if (chunk.type !== 'chunk') {
      continue
    }

    stats.push({
      modules: Object.entries(chunk.modules).map(([rawFilePath, chunkModule]) => {
        const filePath = rawFilePath.startsWith('\u0000')
          ? rawFilePath.slice('\u0000'.length)
          : rawFilePath

        return {
          name: path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath,
          renderedLength: chunkModule.renderedLength,
        }
      }),
      name: chunk.name,
    })
  }

  return {chunks: stats}
}

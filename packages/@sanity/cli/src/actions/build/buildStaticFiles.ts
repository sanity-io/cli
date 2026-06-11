import path from 'node:path'

import {
  type AutoUpdatesBuildConfig,
  buildDebug,
  copyDir,
  extendViteConfigWithUserConfig,
  finalizeViteConfig,
  getViteConfig,
  writeFavicons,
  writeSanityRuntime,
} from '@sanity/cli-build/_internal/build'
import {type CliConfig, type UserViteConfig} from '@sanity/cli-core'
import {type PluginOptions as ReactCompilerConfig} from 'babel-plugin-react-compiler'
import {build} from 'vite'

import {
  getAppEnvironmentVariables,
  getStudioEnvironmentVariables,
} from './getEnvironmentVariables.js'

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
  minify?: boolean
  profile?: boolean
  reactCompiler?: ReactCompilerConfig
  schemaExtraction?: CliConfig['schemaExtraction']
  sourceMap?: boolean
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
    minify = true,
    outputDir,
    reactCompiler,
    schemaExtraction,
    sourceMap = false,
    vite: extendViteConfig,
  } = options

  buildDebug('Writing Sanity runtime files')
  await writeSanityRuntime({
    appTitle,
    basePath,
    cwd,
    entry,
    isApp,
    reactStrictMode: false,
    watch: false,
  })

  function getEnvironmentVariables() {
    return isApp
      ? getAppEnvironmentVariables({jsonEncode: true, prefix: 'process.env.'})
      : getStudioEnvironmentVariables({jsonEncode: true, prefix: 'process.env.'})
  }

  buildDebug('Resolving vite config')
  const mode = 'production'
  let viteConfig = await getViteConfig({
    autoUpdates,
    basePath,
    cwd,
    getEnvironmentVariables,
    isApp,
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

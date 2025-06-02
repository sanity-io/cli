import path from 'node:path'

import {type ReactCompilerConfig, type UserViteConfig} from '../../config/cli/types.js'
import {copyDir} from '../../util/copyDir.js'
import {buildDebug} from './buildDebug.js'
import {extendViteConfigWithUserConfig, finalizeViteConfig, getViteConfig} from './getViteConfig.js'
import {writeFavicons} from './writeFavicons.js'
import {writeSanityRuntime} from './writeSanityRuntime.js'

export interface ChunkModule {
  name: string
  originalLength: number
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

  entry?: string
  importMap?: {imports?: Record<string, string>}
  isApp?: boolean
  minify?: boolean
  profile?: boolean
  reactCompiler?: ReactCompilerConfig
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
    basePath,
    cwd,
    entry,
    importMap,
    isApp,
    minify = true,
    outputDir,
    reactCompiler,
    sourceMap = false,
    vite: extendViteConfig,
  } = options

  buildDebug('Writing Sanity runtime files')
  await writeSanityRuntime({
    basePath,
    cwd,
    entry,
    isApp,
    reactStrictMode: false,
    watch: false,
  })

  buildDebug('Resolving vite config')
  const mode = 'production'
  let viteConfig = await getViteConfig({
    basePath,
    cwd,
    importMap,
    isApp,
    minify,
    mode,
    outputDir,
    reactCompiler,
    sourceMap,
  })

  if (extendViteConfig) {
    viteConfig = await extendViteConfigWithUserConfig(
      {command: 'build', mode},
      viteConfig,
      extendViteConfig,
    )
    viteConfig = await finalizeViteConfig(viteConfig)
  }

  // Copy files placed in /static to the built /static
  buildDebug('Copying static files from /static to output dir')
  const staticPath = path.join(outputDir, 'static')
  await copyDir(path.join(cwd, 'static'), staticPath)

  // Write favicons, not overwriting ones that already exist, to static folder
  buildDebug('Writing favicons to output dir')
  const faviconBasePath = `${basePath.replace(/\/+$/, '')}/static`
  console.log('faviconBasePath', faviconBasePath)
  await writeFavicons(faviconBasePath, staticPath)

  buildDebug('Bundling using vite')
  const {build} = await import('vite')
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
          originalLength: chunkModule.originalLength,
          renderedLength: chunkModule.renderedLength,
        }
      }),
      name: chunk.name,
    })
  }

  return {chunks: stats}
}

import path from 'node:path'

import {type CliConfig, type UserViteConfig} from '@sanity/cli-core'
import {type PluginOptions as ReactCompilerConfig} from 'babel-plugin-react-compiler'
import {build, createBuilder} from 'vite'

import {copyDir} from '../../util/copyDir.js'
import {buildDebug} from './buildDebug.js'
import {extendViteConfigWithUserConfig, finalizeViteConfig, getViteConfig} from './getViteConfig.js'
import {writeFavicons} from './writeFavicons.js'
import {resolveEntries, writeSanityRuntime} from './writeSanityRuntime.js'

export interface ChunkModule {
  name: string
  originalLength: number
  renderedLength: number
}

export interface ChunkStats {
  modules: ChunkModule[]
  name: string
}

interface StaticBuildOptions extends Pick<CliConfig, 'federation'> {
  basePath: string
  cwd: string
  outputDir: string

  appTitle?: string
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
    appTitle,
    basePath,
    cwd,
    entry,
    federation,
    importMap,
    isApp,
    minify = true,
    outputDir,
    reactCompiler,
    sourceMap = false,
    vite: extendViteConfig,
  } = options

  const mode = 'production'

  /* Federation builds only produce the federation environment
   * (remote-entry, mf-manifest) — skip client-specific steps like
   * runtime generation, static file copies, and favicons.
   */
  if (federation?.enabled) {
    buildDebug('Resolving entries for federation build')
    const entries = await resolveEntries({cwd, entry, isApp})

    buildDebug('Resolving vite config (federation)')
    const viteConfig = await getViteConfig({
      basePath,
      cwd,
      entries,
      federation,
      isApp,
      minify,
      mode,
      outputDir,
      reactCompiler,
      sourceMap,
    })

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
    reactStrictMode: false,
    watch: false,
  })

  buildDebug('Resolving vite config')
  let viteConfig = await getViteConfig({
    basePath,
    cwd,
    entries,
    federation,
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
          originalLength: chunkModule.originalLength,
          renderedLength: chunkModule.renderedLength,
        }
      }),
      name: chunk.name,
    })
  }

  return {chunks: stats}
}

import {type ReactCompilerConfig, type UserViteConfig} from '../../config/cli/types.js'
import {buildDebug} from './buildDebug.js'
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
}

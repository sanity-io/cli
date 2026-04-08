import {type ChunkMetadata, type Plugin} from 'vite'

import {decorateIndexWithBridgeScript} from '../../actions/build/decorateIndexWithBridgeScript.js'
import {decorateIndexWithStagingScript} from '../../actions/build/decorateIndexWithStagingScript.js'
import {renderDocument} from '../../actions/build/renderDocument.js'

interface ViteOutputBundle {
  [fileName: string]: ViteRenderedAsset | ViteRenderedChunk
}

interface ViteRenderedAsset {
  type: 'asset'
}

interface ViteRenderedChunk {
  code: string
  facadeModuleId: string | null
  fileName: string
  imports: string[]
  isEntry: boolean
  name: string
  type: 'chunk'
  viteMetadata: ChunkMetadata
}

const entryChunkId = '.sanity/runtime/app.js'

export function sanityBuildEntries(options: {
  autoUpdatesCssUrls?: string[]
  basePath: string
  cwd: string
  importMap?: {imports?: Record<string, string>}
  isApp?: boolean
}): Plugin {
  const {autoUpdatesCssUrls, basePath, cwd, importMap, isApp} = options

  return {
    apply: 'build',
    name: 'sanity/server/build-entries',

    buildStart() {
      this.emitFile({
        id: entryChunkId,
        name: 'sanity',
        type: 'chunk',
      })
    },

    async generateBundle(_options, outputBundle) {
      const bundle = outputBundle as unknown as ViteOutputBundle
      const entryFile = Object.values(bundle).find(
        (file) =>
          file.type === 'chunk' &&
          file.name === 'sanity' &&
          file.facadeModuleId?.endsWith(entryChunkId),
      )

      if (!entryFile) {
        throw new Error(`Failed to find entry file in bundle (${entryChunkId})`)
      }

      if (entryFile.type !== 'chunk') {
        throw new Error('Entry file is not a chunk')
      }

      const entryFileName = entryFile.fileName
      const entryPath = [basePath.replace(/\/+$/, ''), entryFileName].join('/')

      let css: string[] = []
      if (entryFile.viteMetadata?.importedCss) {
        // Check all the top-level imports of the entryPoint to see if they have
        // static CSS assets that need loading
        css = [...entryFile.viteMetadata.importedCss]
        for (const key of entryFile.imports) {
          // Traverse all CSS assets that isn't loaded by the runtime and
          // need <link> tags in the HTML template
          const entry = bundle[key]
          const importedCss =
            entry && entry.type === 'chunk' ? entry.viteMetadata.importedCss : undefined

          if (importedCss) {
            css.push(...importedCss)
          }
        }
      }

      this.emitFile({
        fileName: 'index.html',
        source: decorateIndexWithStagingScript(
          decorateIndexWithBridgeScript(
            await renderDocument({
              autoUpdatesCssUrls,
              importMap,
              isApp,
              props: {
                basePath,
                css,
                entryPath,
              },
              studioRootPath: cwd,
            }),
          ),
        ),
        type: 'asset',
      })
    },
  }
}

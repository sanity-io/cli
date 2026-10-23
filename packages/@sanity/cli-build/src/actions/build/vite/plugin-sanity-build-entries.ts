import {type ChunkMetadata, type Plugin} from 'vite'

import {type AutoUpdatesBuildConfig} from '../autoUpdates.js'
import {createVendorImportMapFromBundle} from '../createVendorImportMapFromBundle.js'
import {decorateIndexWithBridgeScript} from '../decorateIndexWithBridgeScript.js'
import {decorateIndexWithStagingScript} from '../decorateIndexWithStagingScript.js'
import {renderDocument} from '../renderDocument.js'

interface ViteOutputBundle {
  [fileName: string]: ViteRenderedAsset | ViteRenderedChunk
}

interface ViteRenderedAsset {
  type: 'asset'

  fileName?: string
  name?: string | null
  names?: string[]
  originalFileName?: string | null
  originalFileNames?: string[]
}

interface ViteRenderedChunk {
  code: string
  facadeModuleId: string | null
  fileName: string
  imports: string[]
  isEntry: boolean
  name: string
  type: 'chunk'

  /**
   * Populated by Vite when `build.cssCodeSplit` is true. Rolldown-based Vite
   * (Vite 7/8 and `rolldown-vite`) may omit it, or leave `importedCss` empty,
   * for the single stylesheet emitted when code splitting is disabled.
   */
  viteMetadata?: ChunkMetadata
}

const entryChunkId = '.sanity/runtime/app.js'

/**
 * Logical name Vite gives the single CSS asset emitted when
 * `build.cssCodeSplit` is false. `assetFileNames` can change the file written
 * to disk; `names` / `originalFileNames` still carry this value.
 */
const CSS_BUNDLE_NAME = 'style.css'

export function sanityBuildEntries(options: {
  autoUpdates?: AutoUpdatesBuildConfig
  basePath: string
  /**
   * Injects the core-ui bridge script into the emitted `index.html`. Defaults to
   * `true`. Workbench remotes serve themselves standalone and pass `false`.
   */
  bridge?: boolean
  cwd: string
  isApp?: boolean
}): Plugin {
  const {autoUpdates, basePath, bridge = true, cwd, isApp} = options
  // Vite's default. `configResolved` replaces this with the resolved value,
  // including a userland `vite` config that sets `build.cssCodeSplit: false`.
  let cssCodeSplit = true

  return {
    apply: 'build',
    name: 'sanity/server/build-entries',

    configResolved(resolved) {
      cssCodeSplit = resolved.build.cssCodeSplit
    },

    buildStart() {
      this.emitFile({
        id: entryChunkId,
        name: 'sanity',
        type: 'chunk',
      })
    },

    // `vite:css-post` emits the combined stylesheet during its own
    // `generateBundle`. That hook is unordered, so this one has to run after
    // it (`order: 'post'`) or the asset is not in the bundle yet.
    generateBundle: {
      async handler(_options, outputBundle) {
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
        const css = collectStylesheets(entryFile, bundle, cssCodeSplit)

        // For auto-updating studios/apps the import map combines the vendor
        // chunks emitted by this very build (hashed filenames, resolved from the
        // bundle) with the module-CDN imports for auto-updated packages.
        const importMap = autoUpdates
          ? {
              imports: {
                ...createVendorImportMapFromBundle(
                  bundle,
                  autoUpdates.vendor.specifiersByChunkName,
                  basePath,
                ),
                ...autoUpdates.imports,
              },
            }
          : undefined

        const html = await renderDocument({
          autoUpdatesCssUrls: autoUpdates?.cssUrls,
          importMap,
          isApp,
          props: {
            basePath,
            css,
            entryPath,
          },
          studioRootPath: cwd,
        })

        this.emitFile({
          fileName: 'index.html',
          source: decorateIndexWithStagingScript(
            bridge ? decorateIndexWithBridgeScript(html) : html,
          ),
          type: 'asset',
        })
      },
      order: 'post',
    },
  }
}

/**
 * Stylesheets the document should link.
 *
 * With CSS code splitting, Vite records each chunk's styles on
 * `viteMetadata.importedCss` (including the chunks the entry statically
 * imports). With `cssCodeSplit: false`, Vite emits one combined asset instead
 * and never adds it to `importedCss`. `vite:build-html` finds that asset by
 * its bundle name (`style.css`); mirror that, and if Rolldown omits `names` /
 * `originalFileNames`, link every emitted `.css` asset so the document is not
 * unstyled.
 */
function collectStylesheets(
  entryFile: ViteRenderedChunk,
  bundle: ViteOutputBundle,
  cssCodeSplit: boolean,
): string[] {
  const css = collectImportedCss(entryFile, bundle)
  if (cssCodeSplit) return css

  const seen = new Set(css)
  for (const fileName of collectCombinedStylesheets(bundle)) {
    if (seen.has(fileName)) continue
    seen.add(fileName)
    css.push(fileName)
  }
  return css
}

function collectImportedCss(entryFile: ViteRenderedChunk, bundle: ViteOutputBundle): string[] {
  const css = cssFilesFromChunk(entryFile)
  for (const key of entryFile.imports) {
    const imported = bundle[key]
    if (imported?.type === 'chunk') css.push(...cssFilesFromChunk(imported))
  }
  return css
}

function cssFilesFromChunk(chunk: ViteRenderedChunk): string[] {
  const imported = chunk.viteMetadata?.importedCss
  if (!imported) return []
  return [...imported]
}

function collectCombinedStylesheets(bundle: ViteOutputBundle): string[] {
  const cssAssets = Object.values(bundle).filter((file) => isCssAsset(file))
  const named = cssAssets.filter((asset) => isCombinedCssBundle(asset))
  const chosen = named.length > 0 ? named : cssAssets
  return chosen.flatMap((asset) => (asset.fileName ? [asset.fileName] : []))
}

function isCssAsset(file: ViteRenderedAsset | ViteRenderedChunk): file is ViteRenderedAsset {
  return (
    file.type === 'asset' && typeof file.fileName === 'string' && file.fileName.endsWith('.css')
  )
}

function isCombinedCssBundle(asset: ViteRenderedAsset): boolean {
  return assetIdentifiers(asset).some((name) => baseName(name) === CSS_BUNDLE_NAME)
}

function assetIdentifiers(asset: ViteRenderedAsset): string[] {
  return [
    asset.name,
    asset.originalFileName,
    ...(asset.names ?? []),
    ...(asset.originalFileNames ?? []),
  ].filter((name): name is string => typeof name === 'string' && name.length > 0)
}

function baseName(fileName: string): string {
  return fileName.split(/[/\\]/).pop() ?? fileName
}

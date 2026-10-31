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
 * to disk; `names` still carries this value.
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

  const generateBundle: Extract<Plugin['generateBundle'], {handler: unknown}> = {
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
      const vendorImports = autoUpdates
        ? createVendorImportMapFromBundle(
            bundle,
            autoUpdates.vendor.specifiersByChunkName,
            basePath,
          )
        : {}
      const pinned = autoUpdates?.pinned
      const importMap = autoUpdates
        ? {
            imports: {...vendorImports, ...autoUpdates.imports},
            ...(pinned && {
              pinned: {cssUrls: pinned.cssUrls, imports: {...vendorImports, ...pinned.imports}},
            }),
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
        source: decorateIndexWithStagingScript(bridge ? decorateIndexWithBridgeScript(html) : html),
        type: 'asset',
      })
    },
  }

  return {
    apply: 'build',
    name: 'sanity/server/build-entries',

    configResolved(resolved) {
      cssCodeSplit = resolved.build.cssCodeSplit
      // `vite:css-post` emits the combined stylesheet during its own unordered
      // `generateBundle`, so with `cssCodeSplit: false` this hook has to run
      // after it. Default builds keep the normal order so user plugins with an
      // unordered `generateBundle` (HTML minifiers, SRI) still see `index.html`.
      generateBundle.order = cssCodeSplit ? undefined : 'post'
    },

    buildStart() {
      this.emitFile({
        id: entryChunkId,
        name: 'sanity',
        type: 'chunk',
      })
    },

    generateBundle,
  }
}

/**
 * Stylesheets the document should link.
 *
 * With CSS code splitting, Vite records each chunk's styles on
 * `viteMetadata.importedCss` (including the chunks the entry statically
 * imports). With `cssCodeSplit: false`, Vite emits one combined asset instead
 * and never adds it to `importedCss`. `vite:build-html` finds that asset by
 * its bundle name (`style.css`); mirror that. Other CSS assets (e.g. `?url`
 * imports) are not stylesheets for the document and must not be linked.
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
  return Object.values(bundle).flatMap((file) =>
    file.type === 'asset' && file.fileName && isCombinedCssBundle(file) ? [file.fileName] : [],
  )
}

function isCombinedCssBundle(asset: ViteRenderedAsset): boolean {
  return asset.names ? asset.names.includes(CSS_BUNDLE_NAME) : asset.name === CSS_BUNDLE_NAME
}

/*
 * Wraps the app's imports of auto-updated packages so they load from the module server at runtime:
 *
 *   import {Studio} from 'sanity'
 *     -> const m = await load('sanity')
 *        export {m.Studio as Studio, ...}   (export names read from the installed copy)
 *
 * `virtual:sanity/auto-updates` always resolves; `studioProps()` is empty without auto-updates.
 */
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {parseSync, type Plugin, type Rolldown} from 'vite'

import {FEDERATION_DIR_NAME} from '../constants.js'

export const AUTO_UPDATES_ID = 'virtual:sanity/auto-updates'
const RESOLVED_AUTO_UPDATES_ID = `\0${AUTO_UPDATES_ID}`
const WRAPPER_PREFIX = '\0sanity/auto-updates:'
const SPECIFIERS_PLACEHOLDER = '__SANITY_AUTO_UPDATES_SPECIFIERS__'
const LOADER_ENTRY = '@sanity/workbench-cli/_internal_auto_updates'

const loaderPath = fileURLToPath(
  new URL('../../../../_exports/_internal_auto_updates.js', import.meta.url),
)

// The build's `autoUpdates` config, as far as the remote uses it.
export interface AutoUpdates {
  imports: Record<string, string>
  vendor: {specifiersByChunkName: Record<string, string>}

  cssUrls?: string[]
}

export function sanityAutoUpdates(autoUpdates?: AutoUpdates): Plugin[] {
  return [
    {
      config: () => ({resolve: {alias: {[LOADER_ENTRY]: loaderPath}}}),
      load: (id) => (id === RESOLVED_AUTO_UPDATES_ID ? renderAutoUpdatesModule(autoUpdates) : null),
      name: 'sanity/auto-updates',
      resolveId: (source) => (source === AUTO_UPDATES_ID ? RESOLVED_AUTO_UPDATES_ID : null),
    },
    ...(autoUpdates ? [wrapAutoUpdatedImports(autoUpdates.imports)] : []),
  ]
}

function wrapAutoUpdatedImports(imports: Record<string, string>): Plugin {
  // Import map keys: `sanity` for the package, `sanity/` for its subpaths.
  const isAutoUpdated = (source: string) =>
    Object.keys(imports).some((key) =>
      key.endsWith('/') ? source.startsWith(key) : source === key,
    )
  const wrapped = new Set<string>()
  let root = ''

  return {
    applyToEnvironment: (env) => env.config.command === 'build' && env.name === FEDERATION_DIR_NAME,
    configResolved(config) {
      root = config.root
    },
    // Ahead of Vite's resolver, which would resolve the installed package.
    enforce: 'pre',
    async load(id) {
      if (!id.startsWith(WRAPPER_PREFIX)) return null

      const specifier = id.slice(WRAPPER_PREFIX.length)
      const installed = await this.resolve(specifier, path.join(root, 'package.json'), {
        skipSelf: true,
      })
      if (!installed) throw new Error(`Could not resolve ${specifier}`)

      return renderWrapper(specifier, await collectExports(this, installed.id))
    },
    name: 'sanity/auto-updates/wrap-imports',
    // The loader imports every wrapped specifier up front; the list is complete only after the build.
    renderChunk(code) {
      const placeholder = new RegExp(`(["'\`])${SPECIFIERS_PLACEHOLDER}\\1`)
      if (!placeholder.test(code)) return null

      return {
        code: code.replace(placeholder, () => JSON.stringify(JSON.stringify([...wrapped]))),
        map: null,
      }
    },
    resolveId(source, importer) {
      if (importer && isAutoUpdated(source)) {
        wrapped.add(source)
        return WRAPPER_PREFIX + source
      }

      return null
    },
  }
}

function renderAutoUpdatesModule(autoUpdates: AutoUpdates | undefined): string {
  if (!autoUpdates) return 'export const studioProps = () => ({})\n'

  const vendor = Object.values(autoUpdates.vendor.specifiersByChunkName).map(
    (specifier) => `${JSON.stringify(specifier)}: () => import(${JSON.stringify(specifier)})`,
  )

  return `import {createAutoUpdatesLoader} from ${JSON.stringify(LOADER_ENTRY)}
export const {importMapUrl, load} = createAutoUpdatesLoader({
  appId: __SANITY_APP_ID__,
  cssUrls: ${JSON.stringify(autoUpdates.cssUrls ?? [])},
  imports: ${JSON.stringify(autoUpdates.imports)},
  specifiers: JSON.parse(${JSON.stringify(SPECIFIERS_PLACEHOLDER)}),
  vendor: {${vendor.join(', ')}},
})
export const studioProps = () =>
  importMapUrl('sanity') ? {unstable_importMapUrl: importMapUrl('sanity')} : {}
`
}

function renderWrapper(specifier: string, names: string[]): string {
  return `import {load} from ${JSON.stringify(AUTO_UPDATES_ID)}
const m = await load(${JSON.stringify(specifier)})
${names.map((name, index) => `const e${index} = m[${JSON.stringify(name)}]`).join('\n')}
export {${names.map((name, index) => `e${index} as ${JSON.stringify(name)}`).join(', ')}}
`
}

async function collectExports(
  context: Rolldown.PluginContext,
  id: string,
  seen = new Set<string>(),
): Promise<string[]> {
  if (seen.has(id)) return []
  seen.add(id)

  const {module} = parseSync(id, await readFile(id, 'utf8'))
  const names: string[] = []
  for (const {exportName, moduleRequest} of module.staticExports.flatMap(({entries}) => entries)) {
    if (exportName.kind === 'Default') {
      names.push('default')
    } else if (exportName.name) {
      names.push(exportName.name)
    } else if (moduleRequest) {
      const resolved = await context.resolve(moduleRequest.value, id)
      if (!resolved) throw new Error(`Could not resolve ${moduleRequest.value} from ${id}`)

      const reexported = await collectExports(context, resolved.id, seen)
      names.push(...reexported.filter((name) => name !== 'default'))
    }
  }

  return [...new Set(names)]
}

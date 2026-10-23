/*
 * Wraps the app's imports of module CDN packages so they load at runtime, installed copy as fallback:
 *
 *   import {Studio} from 'sanity'
 *     -> const m = await load('sanity', () => import('sanity'))
 *        export {m.Studio as Studio, ...}   (export names read from the installed copy)
 *
 * Imports inside the installed packages stay unwrapped, so the fallback is self-contained.
 * `virtual:sanity/auto-updates` always resolves; `studioProps()` is empty without the CDN.
 */
import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {parseSync, type Plugin, type Rolldown} from 'vite'

import {type ModuleCdnPackage} from '../../autoUpdatesLoader.js'
import {FEDERATION_DIR_NAME} from '../constants.js'

export const AUTO_UPDATES_ID = 'virtual:sanity/auto-updates'
const RESOLVED_AUTO_UPDATES_ID = `\0${AUTO_UPDATES_ID}`
const WRAPPER_PREFIX = '\0sanity/auto-updates:'
const SPECIFIERS_PLACEHOLDER = '__SANITY_AUTO_UPDATES_SPECIFIERS__'
const LOADER_ENTRY = '@sanity/workbench-cli/_internal_auto_updates'

const loaderPath = fileURLToPath(
  new URL('../../../../_exports/_internal_auto_updates.js', import.meta.url),
)

export interface ModuleCdn {
  packages: ModuleCdnPackage[]
  sharedSpecifiers: string[]
}

export function sanityAutoUpdates(moduleCdn?: ModuleCdn): Plugin[] {
  return [
    {
      config: () => ({resolve: {alias: {[LOADER_ENTRY]: loaderPath}}}),
      load: (id) => (id === RESOLVED_AUTO_UPDATES_ID ? renderAutoUpdatesModule(moduleCdn) : null),
      name: 'sanity/auto-updates',
      resolveId: (source) => (source === AUTO_UPDATES_ID ? RESOLVED_AUTO_UPDATES_ID : null),
    },
    ...(moduleCdn ? [wrapCdnImports(moduleCdn.packages)] : []),
  ]
}

function wrapCdnImports(packages: ModuleCdnPackage[]): Plugin {
  const isCdnImport = (source: string) =>
    packages.some(({name}) => source === name || source.startsWith(`${name}/`))
  const isInstalledCopy = (importer: string) =>
    packages.some(({name}) => importer.includes(`/node_modules/${name}/`))
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
    name: 'sanity/auto-updates/wrap-cdn-imports',
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
      if (
        importer &&
        !importer.startsWith(WRAPPER_PREFIX) &&
        isCdnImport(source) &&
        !isInstalledCopy(importer)
      ) {
        wrapped.add(source)
        return WRAPPER_PREFIX + source
      }

      return null
    },
  }
}

function renderAutoUpdatesModule(moduleCdn: ModuleCdn | undefined): string {
  if (!moduleCdn) return 'export const studioProps = () => ({})\n'

  const shared = moduleCdn.sharedSpecifiers.map(
    (specifier) => `${JSON.stringify(specifier)}: () => import(${JSON.stringify(specifier)})`,
  )

  return `import {createAutoUpdatesLoader} from ${JSON.stringify(LOADER_ENTRY)}
export const {load, moduleUrl} = createAutoUpdatesLoader({
  appId: typeof __SANITY_APP_ID__ === 'string' ? __SANITY_APP_ID__ : undefined,
  importModule: (specifier) => import(/* @vite-ignore */ specifier),
  packages: ${JSON.stringify(moduleCdn.packages)},
  shared: {${shared.join(', ')}},
  specifiers: JSON.parse(${JSON.stringify(SPECIFIERS_PLACEHOLDER)}),
})
export const studioProps = () =>
  moduleUrl('sanity') ? {unstable_importMapUrl: moduleUrl('sanity')} : {}
`
}

function renderWrapper(specifier: string, names: string[]): string {
  return `import {load} from ${JSON.stringify(AUTO_UPDATES_ID)}
const m = await load(${JSON.stringify(specifier)}, () => import(${JSON.stringify(specifier)}))
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

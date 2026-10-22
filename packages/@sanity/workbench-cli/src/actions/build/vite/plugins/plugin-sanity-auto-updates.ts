/*
 * Loads a federated app's module CDN packages (`sanity`, `@sanity/sdk*`) at runtime, keeping the
 * installed copy as a lazily loaded fallback:
 *
 *   app code                    import {Studio} from 'sanity'
 *     -> wrapper module         const m = await load('sanity', () => import('sanity'))
 *                               export {m.Studio as Studio, ...}   names read from the installed copy
 *     -> load()                 module CDN, or the installed copy (see `createAutoUpdatesLoader`)
 *
 * Imports from inside the installed packages are not wrapped, so the fallback is self-contained.
 * `virtual:sanity/auto-updates` always resolves: the studio entry renders `Studio` with its
 * `studioProps()`, which are empty unless `sanity` came from the module CDN.
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
const LOADER_ENTRY = '@sanity/workbench-cli/_internal_auto_updates'

const loaderPath = fileURLToPath(
  new URL('../../../../_exports/_internal_auto_updates.js', import.meta.url),
)

export function sanityAutoUpdates(packages: ModuleCdnPackage[] = []): Plugin[] {
  return [
    {
      config: () => ({resolve: {alias: {[LOADER_ENTRY]: loaderPath}}}),
      load: (id) => (id === RESOLVED_AUTO_UPDATES_ID ? renderAutoUpdatesModule(packages) : null),
      name: 'sanity/auto-updates',
      resolveId: (source) => (source === AUTO_UPDATES_ID ? RESOLVED_AUTO_UPDATES_ID : null),
    },
    ...(packages.length > 0 ? [wrapCdnImports(packages)] : []),
  ]
}

function wrapCdnImports(packages: ModuleCdnPackage[]): Plugin {
  const isCdnImport = (source: string) =>
    packages.some(({name}) => source === name || source.startsWith(`${name}/`))
  const isInstalledCopy = (importer: string) =>
    packages.some(({name}) => importer.includes(`/node_modules/${name}/`))
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
    resolveId(source, importer) {
      if (
        importer &&
        !importer.startsWith(WRAPPER_PREFIX) &&
        isCdnImport(source) &&
        !isInstalledCopy(importer)
      ) {
        return WRAPPER_PREFIX + source
      }

      return null
    },
  }
}

function renderAutoUpdatesModule(packages: ModuleCdnPackage[]): string {
  if (packages.length === 0) return 'export const studioProps = () => ({})\n'

  return `import {createAutoUpdatesLoader} from ${JSON.stringify(LOADER_ENTRY)}
import * as React from 'react'
const appId = typeof __SANITY_APP_ID__ === 'string' ? __SANITY_APP_ID__ : undefined
export const {load, moduleUrl} = createAutoUpdatesLoader({
  appId,
  importModule: (specifier) => import(/* @vite-ignore */ specifier),
  packages: ${JSON.stringify(packages)},
  react: React,
})
export const studioProps = () =>
  moduleUrl('sanity') ? {unstable_appId: appId, unstable_importMapUrl: moduleUrl('sanity')} : {}
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

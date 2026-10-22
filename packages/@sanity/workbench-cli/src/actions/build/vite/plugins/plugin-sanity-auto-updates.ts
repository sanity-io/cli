import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {type Plugin, type Rolldown} from 'vite'

import {FEDERATION_DIR_NAME} from '../constants.js'

const LOADER_ENTRY = '@sanity/workbench-cli/_internal_auto_updates'
export const AUTO_UPDATES_LOADER_ID = 'virtual:sanity/auto-updates-loader'
const WRAPPER_PREFIX = '\0sanity/auto-updates:'

const loaderPath = fileURLToPath(
  new URL('../../../../_exports/_internal_auto_updates.js', import.meta.url),
)

export interface AutoUpdatesOptions {
  /** The standalone build's module CDN import map entries. */
  imports: Record<string, string>

  cssUrls?: string[]
}

/**
 * Swaps the federated app's imports of CDN packages for wrappers that load them through
 * `createAutoUpdatesLoader`, with the installed copy as a lazily loaded fallback.
 */
export function sanityAutoUpdates({cssUrls = [], imports}: AutoUpdatesOptions): Plugin {
  const packages = Object.entries(imports)
    .filter(([specifier]) => !specifier.endsWith('/'))
    .map(([name, url]) => ({css: cssUrls.filter((href) => href.startsWith(`${url}/`)), name, url}))
  let root = ''

  return {
    applyToEnvironment: (env) => env.config.command === 'build' && env.name === FEDERATION_DIR_NAME,
    config: () => ({resolve: {alias: {[LOADER_ENTRY]: loaderPath}}}),
    configResolved(config) {
      root = config.root
    },
    // Ahead of Vite's resolver, which would resolve the installed package.
    enforce: 'pre',
    async load(id) {
      if (id === `\0${AUTO_UPDATES_LOADER_ID}`) {
        return `import {createAutoUpdatesLoader} from ${JSON.stringify(LOADER_ENTRY)}
import * as React from 'react'
export const {load, moduleUrl} = createAutoUpdatesLoader({
  importModule: (specifier) => import(/* @vite-ignore */ specifier),
  packages: ${JSON.stringify(packages)},
  react: React,
})
`
      }

      if (!id.startsWith(WRAPPER_PREFIX)) return

      const specifier = id.slice(WRAPPER_PREFIX.length)
      const resolved = await this.resolve(specifier, path.join(root, 'package.json'), {
        skipSelf: true,
      })
      if (!resolved) throw new Error(`Could not resolve ${specifier}`)

      const names = [...(await collectExports(this, resolved.id, new Set()))]

      return `import {load} from ${JSON.stringify(AUTO_UPDATES_LOADER_ID)}
const m = await load(${JSON.stringify(specifier)}, () => import(${JSON.stringify(specifier)}))
${names.map((name, index) => `const e${index} = m[${JSON.stringify(name)}]`).join('\n')}
export {${names.map((name, index) => `e${index} as ${JSON.stringify(name)}`).join(', ')}}
`
    },
    name: 'sanity/auto-updates-loader',
    resolveId(source, importer) {
      if (source === AUTO_UPDATES_LOADER_ID) return `\0${AUTO_UPDATES_LOADER_ID}`
      if (!importer || importer.startsWith(WRAPPER_PREFIX)) return

      // The installed copies import themselves, and must keep doing so in the fallback.
      const pkg = packages.find(({name}) => source === name || source.startsWith(`${name}/`))
      if (pkg && !packages.some(({name}) => importer.includes(`/node_modules/${name}/`))) {
        return WRAPPER_PREFIX + source
      }
    },
  }
}

interface ExportNode {
  type: string

  declaration?: {declarations?: {id: {name: string}}[]; id?: {name: string} | null} | null
  exported?: {name?: string; value?: string} | null
  source?: {value: string} | null
  specifiers?: {exported: {name?: string; value?: string}}[]
}

async function collectExports(
  context: Rolldown.PluginContext,
  id: string,
  seen: Set<string>,
): Promise<Set<string>> {
  const names = new Set<string>()
  if (seen.has(id)) return names
  seen.add(id)

  const program = context.parse(await readFile(id, 'utf8'))
  for (const node of program.body as unknown as ExportNode[]) {
    if (node.type === 'ExportDefaultDeclaration') names.add('default')

    if (node.type === 'ExportNamedDeclaration') {
      for (const {exported} of node.specifiers ?? []) names.add(exported.name ?? exported.value!)
      if (node.declaration?.id) names.add(node.declaration.id.name)
      for (const {id: declarator} of node.declaration?.declarations ?? [])
        names.add(declarator.name)
    }

    if (node.type === 'ExportAllDeclaration') {
      if (node.exported) {
        names.add(node.exported.name ?? node.exported.value!)
        continue
      }

      const resolved = await context.resolve(node.source!.value, id)
      if (!resolved) throw new Error(`Could not resolve ${node.source!.value} from ${id}`)
      for (const name of await collectExports(context, resolved.id, seen)) {
        if (name !== 'default') names.add(name)
      }
    }
  }

  return names
}

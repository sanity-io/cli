import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import {join, relative, sep} from 'node:path'
import {pathToFileURL} from 'node:url'

import {doImport} from '@sanity/cli-core/util'

interface OclifConfig {
  plugins: Map<
    string,
    {
      manifest: {commands: Record<string, {relativePath?: string[]}>}
      pjson: {
        exports?: unknown
        main?: string
        oclif?: {helpClass?: string; hooks?: Record<string, string | string[]>}
      }
      root: string
    }
  >
}

function toPosix(path: string) {
  return path.split(sep).join('/')
}

/** Oclif loads module paths with or without extension. */
function withExtension(root: string, path: string): string | undefined {
  for (const candidate of [
    path,
    `${path}.js`,
    `${path}.mjs`,
    `${path}.cjs`,
    join(path, 'index.js'),
  ]) {
    const file = join(root, candidate)
    if (existsSync(file) && /\.[cm]?js$/.test(file)) return file
  }
  return undefined
}

function exportTargets(exports: unknown): string[] {
  if (typeof exports === 'string') return [exports]
  if (!exports || typeof exports !== 'object') return []
  return Object.entries(exports).flatMap(([key, value]) =>
    key === 'types' || key === 'source' || key.endsWith('.json') ? [] : exportTargets(value),
  )
}

/**
 * Every JavaScript file that is loaded by path rather than imported: the bin
 * entry, public exports, and each oclif plugin's commands, hooks, help class
 * and main.
 */
export async function findBundleEntries(output: string): Promise<string[]> {
  const entries = new Set<string>()
  const add = (root: string, path: string | undefined) => {
    if (!path) return
    const file = withExtension(root, path)
    if (!file) throw new Error(`Missing module ${path} in ${relative(output, root) || '.'}`)
    entries.add(toPosix(relative(output, file)))
  }

  const manifest = JSON.parse(await readFile(join(output, 'package.json'), 'utf8'))
  for (const target of exportTargets(manifest.exports)) add(output, target)
  add(output, 'dist/entry/run.js')

  const {Config} = (await doImport(
    pathToFileURL(join(output, 'dist/node_modules/@oclif/core/lib/index.js')).href,
  )) as {Config: {load(options: unknown): Promise<OclifConfig>}}
  const {getPluginAdditions} = (await doImport(
    pathToFileURL(join(output, 'dist/util/pluginAdditions.js')).href,
  )) as {getPluginAdditions(manifest: URL): Record<string, unknown>}
  const config = await Config.load({
    root: join(output, 'bin/run.js'),
    ...getPluginAdditions(pathToFileURL(join(output, 'dist/package.json'))),
  })
  for (const plugin of config.plugins.values()) {
    const {oclif = {}} = plugin.pjson
    for (const command of Object.values(plugin.manifest.commands)) {
      if (command.relativePath) add(plugin.root, join(...command.relativePath))
    }
    for (const hooks of Object.values(oclif.hooks ?? {})) {
      for (const hook of [hooks].flat()) add(plugin.root, hook)
    }
    add(plugin.root, oclif.helpClass)
    // Oclif resolves a plugin's main module to locate its root.
    if (plugin.root !== output) {
      for (const target of [plugin.pjson.main, ...exportTargets(plugin.pjson.exports)]) {
        if (target && withExtension(plugin.root, target)) add(plugin.root, target)
      }
    }
  }
  return [...entries].toSorted()
}

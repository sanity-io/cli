import {readFile} from 'node:fs/promises'
import path from 'node:path'

import {createBuilder, type InlineConfig, type Plugin, type PluginOption} from 'vite'

import {FEDERATION_DIR_NAME} from './constants.js'
import {getFederationApi} from './plugins/plugin-module-federation.js'
import {
  createFederationSharing,
  type FederationSharing,
  type ResolvedDependency,
  sharedDependencies,
} from './shared-dependencies.js'

export async function discoverSharedDependencies(config: InlineConfig): Promise<InlineConfig> {
  const plugins = await flattenPlugins(config.plugins ?? [])
  const federation = getFederationApi(plugins)
  if (!federation) return config

  const discovery = collectDependencies()
  const scanner = await createBuilder({
    ...config,
    plugins: [
      ...plugins
        .filter((plugin) => plugin.api?.sanityFederation !== federation)
        .map((plugin) => forDiscovery(plugin)),
      discovery.plugin,
      {
        config: () => ({
          environments: {
            [FEDERATION_DIR_NAME]: {
              build: {
                minify: false,
                sourcemap: false,
                write: false,
                ...(federation.inputs.length > 0
                  ? {rolldownOptions: {input: federation.inputs}}
                  : {}),
              },
            },
          },
        }),
        enforce: 'post',
        name: 'sanity/shared-discovery-build',
      },
    ],
  })
  await scanner.build(scanner.environments[FEDERATION_DIR_NAME])

  const firstFederationPlugin = plugins.find(
    (plugin) => plugin.api?.sanityFederation === federation,
  )
  const replacement = federation.create(discovery.sharing())
  return {
    ...config,
    plugins: plugins.flatMap((plugin): PluginOption[] => {
      if (plugin === firstFederationPlugin) return [replacement]
      return plugin.api?.sanityFederation === federation ? [] : [plugin]
    }),
  }
}

async function flattenPlugins(options: PluginOption[]): Promise<Plugin[]> {
  return (
    await Promise.all(
      options.map(async (option): Promise<Plugin[]> => {
        const plugin = await option
        if (!plugin) return []
        return Array.isArray(plugin) ? flattenPlugins(plugin) : [plugin]
      }),
    )
  ).flat()
}

function forDiscovery(plugin: Plugin): Plugin {
  // Discovery must resolve and transform imports without emitting or uploading build artifacts.
  return {
    ...plugin,
    augmentChunkHash: undefined,
    buildEnd: undefined,
    closeBundle: undefined,
    generateBundle: undefined,
    outputOptions: undefined,
    renderChunk: undefined,
    renderError: undefined,
    renderStart: undefined,
    writeBundle: undefined,
  }
}

function collectDependencies(): {
  plugin: Plugin
  sharing: () => FederationSharing | undefined
} {
  const dependencies: ResolvedDependency[] = []
  const packageCache = new Map<string, Promise<ResolvedDependency | undefined>>()
  let unsafe = false

  async function readPackage(id: string): Promise<ResolvedDependency | undefined> {
    if (!path.isAbsolute(id) || id.includes('?')) return undefined
    let directory = path.dirname(id)
    while (directory !== path.dirname(directory)) {
      let contents: string
      try {
        contents = await readFile(path.join(directory, 'package.json'), 'utf8')
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        directory = path.dirname(directory)
        continue
      }
      const pkg = JSON.parse(contents) as {name?: string; version?: string}
      if (!pkg.name || !sharedDependencies.some(({name}) => name === pkg.name)) return undefined
      if (!pkg.version) {
        unsafe = true
        return undefined
      }
      return {name: pkg.name, root: directory, version: pkg.version}
    }
    return undefined
  }

  function packageFor(id: string) {
    if (!path.isAbsolute(id) || id.includes('?')) return
    const directory = path.dirname(id)
    let result = packageCache.get(directory)
    if (!result) {
      result = readPackage(id)
      packageCache.set(directory, result)
    }
    return result
  }

  return {
    plugin: {
      apply: 'build',
      applyToEnvironment: (environment) => environment.name === FEDERATION_DIR_NAME,
      configResolved(config) {
        const viteAliases = new Set([/^\/?@vite\/client/.source, /^\/?@vite\/env/.source])
        unsafe =
          !config.isProduction ||
          config.resolve.alias.some(({find}) => {
            // Vite's own aliases cannot rewrite a shared import; other regexes may hide public subpaths.
            if (typeof find !== 'string') return !viteAliases.has(find.source)
            return sharedDependencies.some(({name}) => find === name || find.startsWith(`${name}/`))
          })
      },
      enforce: 'pre',
      // Relative imports can reach a second installed copy without a bare package import.
      async moduleParsed(module) {
        const dependency = await packageFor(module.id)
        if (dependency) dependencies.push(dependency)
      },
      name: 'sanity/shared-discovery',
      async resolveId(source, importer, options) {
        const definition = sharedDependencies.find(
          ({name}) => source === name || source.startsWith(`${name}/`),
        )
        if (!definition) return
        const {name} = definition
        const resolved = await this.resolve(source, importer, {...options, skipSelf: true})
        if (!resolved || resolved.external) {
          unsafe = true
          return resolved
        }
        const dependency = await packageFor(resolved.id)
        if (!dependency || dependency.name !== name) unsafe = true
        else dependencies.push({...dependency, specifier: source})
        return resolved
      },
    },
    sharing: () => (unsafe ? undefined : createFederationSharing(dependencies)),
  }
}

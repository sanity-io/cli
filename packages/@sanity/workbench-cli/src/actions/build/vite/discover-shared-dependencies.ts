import {readFile} from 'node:fs/promises'
import path from 'node:path'

import {createBuilder, type InlineConfig, type Plugin, type PluginOption} from 'vite'

import {FEDERATION_DIR_NAME} from './constants.js'
import {getFederationApi} from './plugins/plugin-module-federation.js'
import {
  createFederationSharing,
  type FederationSharing,
  findSharedDependencyName,
  type ResolvedDependency,
} from './shared-dependencies.js'

// Vite adds these regex aliases for its virtual client modules.
// They cannot match packages we share, so they do not make discovery unsafe.
const VITE_INTERNAL_ALIAS_PATTERNS = new Set([/^\/?@vite\/client/.source, /^\/?@vite\/env/.source])

export async function discoverSharedDependencies(config: InlineConfig): Promise<InlineConfig> {
  const plugins = await resolvePlugins(config.plugins ?? [])
  const federation = getFederationApi(plugins)
  if (!federation) return config

  const discovery = createSharedDependencyDiscovery()
  const scanner = await createBuilder({
    ...config,
    plugins: [
      ...plugins
        .filter((plugin) => plugin.api?.sanityFederation !== federation)
        .map((plugin): Plugin => ({
          ...plugin,
          // The scan needs import hooks, while output hooks would emit or upload a second build.
          augmentChunkHash: undefined,
          buildEnd: undefined,
          closeBundle: undefined,
          generateBundle: undefined,
          outputOptions: undefined,
          renderChunk: undefined,
          renderError: undefined,
          renderStart: undefined,
          writeBundle: undefined,
        })),
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
  const replacement = federation.create(discovery.getSharing())
  return {
    ...config,
    plugins: plugins.flatMap((plugin): PluginOption[] => {
      if (plugin === firstFederationPlugin) return [replacement]
      return plugin.api?.sanityFederation === federation ? [] : [plugin]
    }),
  }
}

async function resolvePlugins(options: PluginOption[]): Promise<Plugin[]> {
  // Vite flattens PluginOption internally, but discovery needs concrete plugins before createBuilder runs.
  const plugins = (await Promise.all(options))
    .flatMap((plugin) => (Array.isArray(plugin) ? plugin : [plugin]))
    .filter(Boolean)
  return plugins.some((plugin) => plugin instanceof Promise || Array.isArray(plugin))
    ? resolvePlugins(plugins)
    : (plugins as Plugin[])
}

function createSharedDependencyDiscovery(): {
  getSharing: () => FederationSharing | undefined
  plugin: Plugin
} {
  const dependencies: ResolvedDependency[] = []
  const packageCache = new Map<string, Promise<ResolvedDependency | undefined>>()
  let unsafe = false

  async function findSharedPackage(id: string): Promise<ResolvedDependency | undefined> {
    let directory = path.dirname(id)
    while (directory !== path.dirname(directory)) {
      const manifest = await readPackageManifest(directory)
      if (!manifest) {
        directory = path.dirname(directory)
        continue
      }

      if (!manifest.name || findSharedDependencyName(manifest.name) !== manifest.name) return
      if (!manifest.version) {
        unsafe = true
        return
      }
      return {name: manifest.name, root: directory, version: manifest.version}
    }
  }

  async function packageForModule(id: string): Promise<ResolvedDependency | undefined> {
    // Virtual module IDs and transform query suffixes do not map to a package.json on disk.
    if (!path.isAbsolute(id) || id.includes('?')) return
    const directory = path.dirname(id)
    const cached = packageCache.get(directory)
    if (cached) return cached

    const pending = findSharedPackage(id)
    packageCache.set(directory, pending)
    return pending
  }

  const plugin: Plugin = {
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === FEDERATION_DIR_NAME,
    configResolved(config) {
      unsafe ||=
        !config.isProduction ||
        config.resolve.alias.some(({find}) => aliasMayRewriteSharedImport(find))
    },
    enforce: 'pre',
    // Relative imports can reach a second installed copy without a bare package import.
    async moduleParsed(module) {
      const dependency = await packageForModule(module.id)
      if (dependency) dependencies.push(dependency)
    },
    name: 'sanity/shared-discovery',
    async resolveId(source, importer, options) {
      const dependencyName = findSharedDependencyName(source)
      if (!dependencyName) return

      const resolved = await this.resolve(source, importer, {...options, skipSelf: true})
      if (!resolved || resolved.external) {
        unsafe = true
        return resolved
      }

      const dependency = await packageForModule(resolved.id)
      if (!dependency || dependency.name !== dependencyName) unsafe = true
      else dependencies.push({...dependency, specifier: source})
      return resolved
    },
  }

  return {
    getSharing: () => (unsafe ? undefined : createFederationSharing(dependencies)),
    plugin,
  }
}

async function readPackageManifest(
  directory: string,
): Promise<{name?: string; version?: string} | undefined> {
  try {
    return JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')) as {
      name?: string
      version?: string
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function aliasMayRewriteSharedImport(find: RegExp | string): boolean {
  if (typeof find === 'string') {
    return Boolean(findSharedDependencyName(find))
  }

  // Any other regex could rewrite a shared package or subpath, so we stop sharing.
  return !VITE_INTERNAL_ALIAS_PATTERNS.has(find.source)
}

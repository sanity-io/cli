import {readFile} from 'node:fs/promises'
import path from 'node:path'

import {createBuilder, type InlineConfig, type Plugin, type PluginOption} from 'vite'

import {FEDERATION_DIR_NAME} from './constants.js'
import {
  createFederationSharing,
  type FederationSharing,
  type ResolvedDependency,
  sharedDependencies,
} from './shared-dependencies.js'

export interface FederationBuildOptions {
  discovery?: boolean
  sharing?: FederationSharing
}

async function discoveryPlugins(options: PluginOption[]): Promise<Plugin[]> {
  return (
    await Promise.all(
      options.map(async (option): Promise<Plugin[]> => {
        const resolved = await option
        if (Array.isArray(resolved)) return discoveryPlugins(resolved)
        if (!resolved) return []
        // Discovery needs transforms, but must not publish artifacts or finalize a build.
        return [
          {
            ...resolved,
            augmentChunkHash: undefined,
            buildEnd: undefined,
            closeBundle: undefined,
            generateBundle: undefined,
            outputOptions: undefined,
            renderChunk: undefined,
            renderError: undefined,
            renderStart: undefined,
            writeBundle: undefined,
          },
        ]
      }),
    )
  ).flat()
}

// Recreate Sanity plugins per pass; object-form user plugins still share their closures.
export async function buildFederatedApp(
  createConfig: (options: FederationBuildOptions) => InlineConfig | Promise<InlineConfig>,
): Promise<void> {
  // Federation fixes its providers before Vite resolves imports, including compiler-generated subpaths.
  const config = await createConfig({discovery: true})
  const discovery = discoverSharedDependencies()
  const scanner = await createBuilder({
    ...config,
    plugins: [
      ...(await discoveryPlugins(config.plugins ?? [])),
      discovery.plugin,
      {
        config: () => ({
          environments: {
            [FEDERATION_DIR_NAME]: {
              build: {
                minify: false,
                sourcemap: false,
                write: false,
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
  const builder = await createBuilder(await createConfig({sharing: discovery.sharing()}))
  await builder.buildApp()
}

function discoverSharedDependencies(): {
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

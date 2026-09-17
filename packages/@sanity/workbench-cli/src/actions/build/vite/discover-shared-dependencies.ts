import {readFile} from 'node:fs/promises'
import path from 'node:path'

import {createBuilder, type InlineConfig, type Plugin, type PluginOption} from 'vite'

import {FEDERATION_DIR_NAME} from './constants.js'
import {getFederationApi} from './plugins/plugin-module-federation.js'
import {
  aliasMayRewriteSharedImport,
  createFederationSharing,
  type FederationSharing,
  findSharedDependencyName,
  type ResolvedDependency,
} from './shared-dependencies.js'

export async function buildFederatedApp(
  config: InlineConfig,
  {
    reuseStandaloneBuild = false,
  }: {
    // Only the unmodified CLI config guarantees matching resolution in both environments.
    reuseStandaloneBuild?: boolean
  } = {},
): Promise<void> {
  const plugins = await resolvePlugins(config.plugins ?? [])
  const federation = getFederationApi(plugins)
  if (!federation) {
    const builder = await createBuilder(config)
    await builder.buildApp()
    return
  }

  const discovery = createSharedDependencyDiscovery({
    environmentName: reuseStandaloneBuild ? 'client' : FEDERATION_DIR_NAME,
    inputs: reuseStandaloneBuild ? federation.inputs : [],
  })
  const localPlugins = plugins.filter((plugin) => plugin.api?.sanityFederation !== federation)

  if (reuseStandaloneBuild) {
    const standalone = await createBuilder({
      ...config,
      plugins: [...localPlugins, discovery.plugin],
    })
    await standalone.build(standalone.environments.client)
  } else {
    await scanDependencies(config, localPlugins, discovery.plugin, federation.inputs)
  }

  const firstFederationPlugin = plugins.find(
    (plugin) => plugin.api?.sanityFederation === federation,
  )
  const replacement = federation.create(discovery.getSharing())
  const builder = await createBuilder({
    ...config,
    plugins: plugins.flatMap((plugin): PluginOption[] => {
      if (plugin === firstFederationPlugin) return [replacement]
      return plugin.api?.sanityFederation === federation ? [] : [plugin]
    }),
  })
  await (reuseStandaloneBuild
    ? builder.build(builder.environments[FEDERATION_DIR_NAME])
    : builder.buildApp())
}

async function scanDependencies(
  config: InlineConfig,
  plugins: Plugin[],
  discovery: Plugin,
  inputs: string[],
): Promise<void> {
  const discoveryComplete = new Error('Shared dependency discovery complete')
  const scanner = await createBuilder({
    ...config,
    // Vite would log our intentional stop as a build failure, so silence its logger during the scan.
    // The catch below ignores only that stop signal and rethrows real errors for the CLI to report.
    logLevel: 'silent',
    plugins: [
      ...plugins.map((plugin): Plugin => ({
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
      discovery,
      {
        buildEnd(error) {
          // Vite has no scan-only build API; stop after the graph, before generating unused chunks.
          if (!error) throw discoveryComplete
        },
        config: () => ({
          environments: {
            [FEDERATION_DIR_NAME]: {
              build: {
                minify: false,
                sourcemap: false,
                write: false,
                ...(inputs.length > 0 ? {rolldownOptions: {input: inputs}} : {}),
              },
            },
          },
        }),
        enforce: 'post',
        name: 'sanity/shared-discovery-build',
      },
    ],
  })
  try {
    await scanner.build(scanner.environments[FEDERATION_DIR_NAME])
  } catch (error) {
    // Rolldown groups hook errors; only suppress our marker when no other hook failed.
    const errors = error instanceof Error && 'errors' in error ? error.errors : [error]
    if (!Array.isArray(errors) || errors.length !== 1 || errors[0] !== discoveryComplete) {
      throw error
    }
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

function createSharedDependencyDiscovery({
  environmentName,
  inputs,
}: {
  environmentName: string
  inputs: string[]
}): {
  getSharing: () => FederationSharing | undefined
  plugin: Plugin
} {
  const dependencies: ResolvedDependency[] = []
  const packageCache = new Map<string, Promise<ResolvedDependency | undefined>>()
  let unsafe = false
  let inputsLoaded = false

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
    applyToEnvironment: (environment) => environment.name === environmentName,
    configResolved(config) {
      unsafe ||=
        !config.isProduction ||
        config.resolve.alias.some(({find}) => aliasMayRewriteSharedImport(find))
    },
    enforce: 'pre',
    // Relative imports can reach a second installed copy without a bare package import.
    async moduleParsed(module) {
      if (module.isEntry && !inputsLoaded) {
        inputsLoaded = true
        // Inspect remote-only imports without emitting their entries in the standalone bundle.
        await Promise.all(inputs.map((id) => this.load({id, resolveDependencies: true})))
      }
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

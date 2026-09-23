import {readFile} from 'node:fs/promises'
import path from 'node:path'

import {createBuilder, createLogger, type InlineConfig, type Plugin, type PluginOption} from 'vite'

import {FEDERATION_DIR_NAME} from './constants.js'
import {getFederationHostApi} from './plugins/plugin-federation-host.js'
import {getFederationApi} from './plugins/plugin-module-federation.js'
import {
  aliasMayRewriteSharedImport,
  createFederationSharing,
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

  // Loading remote-only exposes in the SPA can emit worker bundles even when their imports are unused.
  reuseStandaloneBuild &&= !federation.hasAdditionalExposes
  const discovery = createSharedDependencyDiscovery(
    reuseStandaloneBuild ? 'client' : FEDERATION_DIR_NAME,
  )
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
  const sharing = discovery.getSharing()
  const enabledSharing = 'disabledReason' in sharing ? undefined : sharing
  const host = getFederationHostApi(plugins)
  host?.provide(enabledSharing)
  const replacement = federation.create(enabledSharing)
  const builder = await createBuilder({
    ...config,
    plugins: plugins.flatMap((plugin): PluginOption[] => {
      if (plugin === firstFederationPlugin) return [replacement]
      return plugin.api?.sanityFederation === federation ? [] : [plugin]
    }),
  })
  if ('disabledReason' in sharing) {
    // CLI builds silence Vite's progress output; keep the reason for disabled sharing visible.
    createLogger('warn', {customLogger: builder.config.customLogger}).warn(
      `Dependency sharing disabled: ${sharing.disabledReason}. Dependencies will be bundled locally.`,
    )
  }
  // A reused standalone build served the host module before discovery settled its providers.
  await (reuseStandaloneBuild && !host?.requested
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

function createSharedDependencyDiscovery(environmentName: string): {
  getSharing: () => ReturnType<typeof createFederationSharing>
  plugin: Plugin
} {
  const dependencies: ResolvedDependency[] = []
  const packageCache = new Map<string, Promise<ResolvedDependency | undefined>>()
  let disabledReason: string | undefined

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
        disabledReason ??= `${manifest.name} has no version in its package.json`
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
      if (!config.isProduction) disabledReason ??= 'This is not a production build'
      const alias = config.resolve.alias.find(({find}) => aliasMayRewriteSharedImport(find))
      if (alias)
        disabledReason ??= `The Vite alias ${String(alias.find)} may rewrite a shared dependency import`
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
        disabledReason ??= resolved?.external
          ? `${source} is external to the build`
          : `${source} could not be resolved`
        return resolved
      }

      const dependency = await packageForModule(resolved.id)
      if (!dependency || dependency.name !== dependencyName) {
        disabledReason ??= `${source} does not resolve to an installed ${dependencyName} package`
      } else dependencies.push({...dependency, specifier: source})
      return resolved
    },
  }

  return {
    getSharing: () => (disabledReason ? {disabledReason} : createFederationSharing(dependencies)),
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

import {dirname, resolve as resolvePath} from 'node:path'
import {isMainThread} from 'node:worker_threads'

import {getTsconfig} from 'get-tsconfig'
import {createServer, type InlineConfig, loadEnv, mergeConfig} from 'vite'
import {ViteNodeRunner} from 'vite-node/client'
import {ViteNodeServer} from 'vite-node/server'
import {installSourcemapsSupport} from 'vite-node/source-map'

import {getCliConfig} from '../../config/cli/getCliConfig.js'
import {type CliConfig} from '../../config/cli/types/cliConfig.js'
import {subdebug} from '../../debug.js'
import {isNotFoundError} from '../../errors/NotFoundError.js'
import {getStudioEnvironmentVariables} from '../../util/environment/getStudioEnvironmentVariables.js'
import {setupBrowserStubs} from '../../util/environment/setupBrowserStubs.js'
import {isRecord} from '../../util/isRecord.js'

if (isMainThread) {
  throw new Error('Should be child of thread, not the main thread')
}

const rootPath = process.env.STUDIO_WORKER_STUDIO_ROOT_PATH
if (!rootPath) {
  throw new Error('Missing `STUDIO_WORKER_STUDIO_ROOT_PATH` environment variable')
}

const debug = subdebug('studio:worker')

const workerScriptPath = process.env.STUDIO_WORKER_TASK_FILE
if (!workerScriptPath) {
  throw new Error('Missing `STUDIO_WORKER_TASK_FILE` environment variable')
}

await setupBrowserStubs()

const studioEnvVars = await getStudioEnvironmentVariables(rootPath)

// Allow the CLI config (`sanity.cli.(js|ts)`) to define a `vite` property which can
// extend/modify the default vite configuration for the studio.
let cliConfig: CliConfig | undefined
try {
  cliConfig = await getCliConfig(rootPath)
} catch (err) {
  debug('Failed to load CLI config: %o', err)
  if (!isNotFoundError(err)) {
    // eslint-disable-next-line no-console
    console.warn('[warn] Failed to load CLI config:', err)
  }
}

/**
 * Reads tsconfig.json `paths` and converts them to Vite `resolve.alias` entries.
 * This allows studio projects using path aliases (e.g. `"@/*": ["./src/*"]`) to work
 * with CLI worker commands without requiring the user to manually add `vite-tsconfig-paths`.
 */
function getTsconfigPathAliases(studioRootPath: string): Record<string, string> {
  const tsconfig = getTsconfig(studioRootPath)
  if (!tsconfig) return {}

  const {baseUrl, paths} = tsconfig.config.compilerOptions ?? {}
  if (!paths) return {}

  const tsconfigDir = dirname(tsconfig.path)
  const base = baseUrl ? resolvePath(tsconfigDir, baseUrl) : tsconfigDir

  const aliases: Record<string, string> = {}
  for (const [pattern, targets] of Object.entries(paths)) {
    if (!targets || targets.length === 0) continue
    // Only the first target is used — multiple fallback targets are not supported
    const target = targets[0]

    if (pattern.endsWith('/*') && target.endsWith('/*')) {
      // Wildcard: "@/*" => "./src/*" becomes "@" => "/abs/path/src"
      aliases[pattern.slice(0, -2)] = resolvePath(base, target.slice(0, -2))
    } else {
      // Exact: "@utils" => "./src/utils/index"
      aliases[pattern] = resolvePath(base, target)
    }
  }
  // Sort by key length descending so more-specific aliases take precedence
  // (e.g. "@lib" is matched before "@" when both exist)
  return Object.fromEntries(Object.entries(aliases).toSorted(([a], [b]) => b.length - a.length))
}

/**
 * Fetches and caches modules from HTTP/HTTPS URLs.
 * Vite's SSR transform treats `https://` imports as external and bypasses the plugin
 * resolve pipeline entirely, so we intercept them at the ViteNodeRunner level instead.
 */
const httpModuleCache = new Map<string, string>()
async function fetchHttpModule(url: string): Promise<{code: string}> {
  const cached = httpModuleCache.get(url)
  if (cached) return {code: cached}

  debug('Fetching HTTP import: %s', url)
  const response = await fetch(url, {signal: AbortSignal.timeout(30_000)})
  if (!response.ok) {
    throw new Error(`Failed to fetch module from ${url}: ${response.status} ${response.statusText}`)
  }

  const code = await response.text()
  httpModuleCache.set(url, code)
  return {code}
}

function isHttpsUrl(id: string): boolean {
  return id.startsWith('https://')
}

let tsconfigAliases: Record<string, string> = {}
try {
  tsconfigAliases = getTsconfigPathAliases(rootPath)
} catch (err) {
  debug('Failed to read tsconfig paths: %o', err)
}

const defaultViteConfig: InlineConfig = {
  build: {target: 'node'},
  configFile: false,
  // Inject environment variables as compile-time constants for Vite
  define: Object.fromEntries(
    Object.entries(studioEnvVars).map(([key, value]) => [
      `process.env.${key}`,
      JSON.stringify(value),
    ]),
  ),
  envPrefix: cliConfig && 'app' in cliConfig ? 'SANITY_APP_' : 'SANITY_STUDIO_',
  esbuild: {
    jsx: 'automatic',
  },
  logLevel: 'error',
  optimizeDeps: {
    include: undefined,
    noDiscovery: true,
  },
  resolve: {
    alias: tsconfigAliases,
  },
  root: rootPath,
  server: {
    hmr: false,
    watch: null,
  },
  ssr: {
    /**
     * We don't want to externalize any dependencies, we want everything to run thru vite.
     * Especially for CJS compatibility, etc.
     */
    noExternal: true,
  },
}

// Merge the CLI config's Vite config with the default Vite config
let viteConfig = defaultViteConfig
if (typeof cliConfig?.vite === 'function') {
  viteConfig = (await cliConfig.vite(viteConfig, {
    command: 'build',
    isSsrBuild: true,
    mode: 'production',
  })) as InlineConfig
} else if (isRecord(cliConfig?.vite)) {
  viteConfig = mergeConfig(viteConfig, cliConfig.vite)
}

debug('Creating Vite server with config: %o', viteConfig)
// Vite will build the files we give it - targetting Node.js instead of the browser.
// We include the inject plugin in order to provide the stubs for the undefined global APIs.
const server = await createServer(viteConfig)

// Bit of a hack, but seems necessary based on the `node-vite` binary implementation
await server.pluginContainer.buildStart({})

// Load environment variables from `.env` files in the same way as Vite does.
// Note that Sanity also provides environment variables through `process.env.*` for compat reasons,
// and so we need to do the same here.
// Load ALL env vars from .env files (not just studio-prefixed ones) so non-Sanity-prefixed
// vars (e.g. NEXT_PUBLIC_*, VITE_*) are available via process.env at runtime.
// The ??= on the next line prevents overwriting existing process.env values.
const env = loadEnv(server.config.mode, server.config.envDir, '')
for (const key in env) {
  process.env[key] ??= env[key]
}

// Now we're providing the glue that ensures node-specific loading and execution works.
const node = new ViteNodeServer(server)

// Should make it easier to debug any crashes in the imported code…
installSourcemapsSupport({
  getSourceMap: (source) => node.getSourceMap(source),
})

const runner = new ViteNodeRunner({
  base: server.config.base,
  async fetchModule(id) {
    // Vite's SSR transform externalizes https:// imports, so Node's ESM loader
    // would reject them. We fetch the module over HTTP and run it through Vite's
    // SSR transform to rewrite ESM export/import syntax to the __vite_ssr_*
    // format that ViteNodeRunner expects.
    if (isHttpsUrl(id)) {
      const {code: rawCode} = await fetchHttpModule(id)
      const result = await server.ssrTransform(rawCode, null, id)
      return {code: result?.code || rawCode}
    }
    return node.fetchModule(id)
  },
  resolveId(id, importer) {
    // Prevent vite-node from trying to resolve HTTP URLs through Node's resolver
    if (isHttpsUrl(id)) return {id}
    // Resolve any import from an HTTP-fetched module against the remote origin
    // (e.g. esm.sh returns `export * from '/pkg@1.0/es2022/pkg.mjs'`)
    if (importer && isHttpsUrl(importer)) {
      return {id: new URL(id, importer).href}
    }
    return node.resolveId(id, importer)
  },
  root: server.config.root,
})

// Copied from `vite-node` - it appears that this applies the `define` config from
// vite, but it also takes a surprisingly long time to execute. Not clear at this
// point why this is, so we should investigate whether it's necessary or not.
await runner.executeId('/@vite/env')

await runner.executeId(workerScriptPath)

// Close the Vite server to release handles. Especially important with Vite 8+
// where Rolldown's native bindings can keep the worker thread's event loop alive.
await server.close()

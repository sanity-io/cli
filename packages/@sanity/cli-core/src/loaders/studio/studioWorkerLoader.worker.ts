import {isMainThread} from 'node:worker_threads'

import {createServer, type InlineConfig, loadEnv, mergeConfig} from 'vite'
import {ViteNodeRunner} from 'vite-node/client'
import {ViteNodeServer} from 'vite-node/server'
import {installSourcemapsSupport} from 'vite-node/source-map'

import {getCliConfig} from '../../config/cli/getCliConfig.js'
import {type CliConfig} from '../../config/cli/types/cliConfig.js'
import {subdebug} from '../../debug.js'
import {getStudioEnvironmentVariables} from '../../util/environment/getStudioEnvironmentVariables.js'
import {setupBrowserStubs} from '../../util/environment/setupBrowserStubs.js'
import {isRecord} from '../../util/isRecord.js'
import {isNotFoundError} from '../../util/NotFoundError.js'

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
 * Fetches and caches modules from HTTP/HTTPS URLs.
 * Vite's SSR transform treats `https://` imports as external and bypasses the plugin
 * resolve pipeline entirely, so we intercept them at the ViteNodeRunner level instead.
 */
const httpModuleCache = new Map<string, string>()
async function fetchHttpModule(url: string): Promise<{code: string}> {
  const cached = httpModuleCache.get(url)
  if (cached) return {code: cached}

  debug('Fetching HTTP import: %s', url)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch module from ${url}: ${response.status} ${response.statusText}`)
  }

  const code = await response.text()
  httpModuleCache.set(url, code)
  return {code}
}

function isHttpUrl(id: string): boolean {
  return id.startsWith('https://') || id.startsWith('http://')
}

const defaultViteConfig: InlineConfig = {
  build: {target: 'node'},
  configFile: false, // @todo Should use `vite` prop from `sanity.cli.ts` (if any)
  // Inject environment variables as compile-time constants for Vite
  define: Object.fromEntries(
    Object.entries(studioEnvVars).map(([key, value]) => [
      `process.env.${key}`,
      JSON.stringify(value),
    ]),
  ),
  // TODO: Combine with `determineIsApp` from `@sanity/cli`
  envPrefix: cliConfig && 'app' in cliConfig ? 'SANITY_APP_' : 'SANITY_STUDIO_',
  esbuild: {
    jsx: 'automatic',
  },
  logLevel: 'error',
  optimizeDeps: {
    include: undefined,
    noDiscovery: true,
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
// @todo is this in line with sanity?
const env = loadEnv(server.config.mode, server.config.envDir, viteConfig.envPrefix ?? '')
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
    if (isHttpUrl(id)) {
      const {code: rawCode} = await fetchHttpModule(id)
      const result = await server.ssrTransform(rawCode, null, id)
      return {code: result?.code || rawCode}
    }
    return node.fetchModule(id)
  },
  resolveId(id, importer) {
    // Prevent vite-node from trying to resolve HTTP URLs through Node's resolver
    if (isHttpUrl(id)) return {id}
    // Resolve any import from an HTTP-fetched module against the remote origin
    // (e.g. esm.sh returns `export * from '/pkg@1.0/es2022/pkg.mjs'`)
    if (importer && isHttpUrl(importer)) {
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

import {isMainThread, parentPort} from 'node:worker_threads'

import {createServer, type InlineConfig, loadEnv, mergeConfig} from 'vite'
import {ViteNodeRunner} from 'vite-node/client'
import {ViteNodeServer} from 'vite-node/server'
import {installSourcemapsSupport} from 'vite-node/source-map'

import {subdebug} from '../../_exports/debug.js'
import {getCliConfig} from '../../config/cli/getCliConfig.js'
import {type CliConfig} from '../../config/cli/types/cliConfig.js'
import {isNotFoundError} from '../../errors/NotFoundError.js'
import {getStudioEnvironmentVariables} from '../../util/environment/getStudioEnvironmentVariables.js'
import {setupBrowserStubs} from '../../util/environment/setupBrowserStubs.js' // TODO: this imports jsdom!!! Unpacked Size (module + dependencies): 26 MB
import {isRecord} from '../../util/isRecord.js'
import {createOneShotWorkerLifecycle} from './studioWorkerLifecycle.js'

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
    // Resolve the studio's tsconfig `paths` natively (Vite 8+), replacing the
    // custom alias mapping and the need for a user-added `vite-tsconfig-paths`.
    tsconfigPaths: true,
  },
  root: rootPath,
  server: {
    hmr: false,
    watch: null,
  },
  ssr: {
    /**
     * Except jsdom: it is loaded by the browser-stub environment, is huge
     * (~10MB of CJS that gains nothing from the Vite pipeline), and must be
     * resolved by Node itself so distributions that provide it outside the
     * task-file graph (e.g. the bundled CLI's toolchain resolution hook) keep
     * working — Vite's resolver does not consult Node module customization
     * hooks.
     */
    external: ['jsdom'],
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

// One-shot tasks (`studioWorkerTask`) resolve on their first message, and the
// main thread historically terminate()d the worker right after — destroying
// the worker's libuv loop while rolldown's native threads were still live.
// The next `napi_call_threadsafe_function` then locked a destroyed mutex and
// aborted the whole process (silent SIGABRT / exit code 134, reliably
// reproduced on macOS). The lifecycle closes the Vite server BEFORE any
// message reaches the main thread, and the main thread no longer terminates
// one-shot workers at all (see `terminateOnSettle` in promisifyWorker).
const lifecycle =
  process.env.STUDIO_WORKER_ONE_SHOT === '1' && parentPort
    ? createOneShotWorkerLifecycle({
        closeServer: async () => {
          debug('Closing Vite server')
          await server.close()
          debug('Vite server closed')
        },
        onCloseError: (error) => debug('Failed to close Vite server: %o', error),
        parentPort,
      })
    : undefined

try {
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
} catch (error) {
  // Long-lived workers keep the original behavior: the error surfaces as a
  // Worker 'error' event.
  if (!lifecycle) {
    throw error
  }

  // One-shot workers close the server first and post a serialized error the
  // main thread rethrows, so the worker exits cleanly (code 0) and the real
  // error (e.g. a broken `sanity.config.ts`) isn't masked by a teardown abort.
  await lifecycle.postError(error)
} finally {
  await lifecycle?.close()
}

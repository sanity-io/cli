import {isMainThread} from 'node:worker_threads'

import {
  createServer,
  createServerModuleRunner,
  type InlineConfig,
  isRunnableDevEnvironment,
  loadEnv,
  mergeConfig,
} from 'vite'

import {getCliConfig} from '../../config/cli/getCliConfig.js'
import {type CliConfig} from '../../config/cli/types/cliConfig.js'
import {subdebug} from '../../debug.js'
import {isNotFoundError} from '../../errors/NotFoundError.js'
import {getStudioEnvironmentVariables} from '../../util/environment/getStudioEnvironmentVariables.js'
import {setupBrowserStubs} from '../../util/environment/setupBrowserStubs.js'
import {isRecord} from '../../util/isRecord.js'
import {StudioModuleEvaluator} from './studioModuleEvaluator.js'

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
 * resolve pipeline entirely, so we intercept them at the module runner level instead.
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

const ssrEnvironment = server.environments.ssr
if (!isRunnableDevEnvironment(ssrEnvironment)) {
  throw new Error('Expected SSR environment to be a runnable dev environment')
}

await ssrEnvironment.init()

// Override fetchModule to support https:// imports and resolve relative imports from
// remote modules (e.g. esm.sh re-exports with absolute paths).
const defaultFetchModule = ssrEnvironment.fetchModule.bind(ssrEnvironment)
ssrEnvironment.fetchModule = async (id, importer, options) => {
  if (importer && isHttpsUrl(importer) && !isHttpsUrl(id)) {
    id = new URL(id, importer).href
  }
  if (isHttpsUrl(id)) {
    const {code: rawCode} = await fetchHttpModule(id)
    const result = await server.ssrTransform(rawCode, null, id)
    return {
      code: result?.code || rawCode,
      file: null,
      id,
      invalidate: false,
      url: id,
    }
  }

  return defaultFetchModule(id, importer, options)
}

const runner = createServerModuleRunner(ssrEnvironment, {
  evaluator: new StudioModuleEvaluator(),
  hmr: false,
})

// Applies the `define` config from vite. Also initializes import.meta.env.
await runner.import('/@vite/env')

await runner.import(workerScriptPath)

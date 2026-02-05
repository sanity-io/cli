import {isMainThread} from 'node:worker_threads'

import {createServer, createServerModuleRunner, type InlineConfig, loadEnv, mergeConfig} from 'vite'

import {getCliConfig} from '../../config/cli/getCliConfig.js'
import {type CliConfig} from '../../config/cli/types/cliConfig.js'
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

const workerScriptPath = process.env.STUDIO_WORKER_TASK_FILE
if (!workerScriptPath) {
  throw new Error('Missing `STUDIO_WORKER_TASK_FILE` environment variable')
}

await setupBrowserStubs()

const studioEnvVars = await getStudioEnvironmentVariables(rootPath)

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
  logLevel: 'error',
  optimizeDeps: {disabled: true}, // @todo is this necessary? cant remember why was added
  root: rootPath,
  server: {
    hmr: false,
    watch: null,
  },
}

// Allow the CLI config (`sanity.cli.(js|ts)`) to define a `vite` property which can
// extend/modify the default vite configuration for the studio.
let cliConfig: CliConfig | undefined
try {
  cliConfig = await getCliConfig(rootPath)
} catch (err) {
  if (!isNotFoundError(err)) {
    // eslint-disable-next-line no-console
    console.warn('[warn] Failed to load CLI config:', err)
  }
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

// Vite will build the files we give it - targetting Node.js instead of the browser.
// We include the inject plugin in order to provide the stubs for the undefined global APIs.
const server = await createServer(viteConfig)

// Bit of a hack, but seems necessary based on the `node-vite` binary implementation
await server.pluginContainer.buildStart({})

// Load environment variables from `.env` files in the same way as Vite does.
// Note that Sanity also provides environment variables through `process.env.*` for compat reasons,
// and so we need to do the same here.
// @todo is this in line with sanity?
const env = loadEnv(server.config.mode, server.config.envDir, '')
for (const key in env) {
  process.env[key] ??= env[key]
}

// Now we're using Vite's Module Runner (replaces vite-node in Vite 4+)
const runner = await createServerModuleRunner(server.environments.ssr, {
  hmr: false,
  sourcemapInterceptor: 'prepareStackTrace',
})

// Apply the `define` config from vite - imports environment variables
await runner.import('/@vite/env')

// Execute the worker script
await runner.import(workerScriptPath)

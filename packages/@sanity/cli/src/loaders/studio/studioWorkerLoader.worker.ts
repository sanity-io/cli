import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {isMainThread} from 'node:worker_threads'

import {moduleResolve} from 'import-meta-resolve'
import {createServer, type InlineConfig, loadEnv, mergeConfig} from 'vite'
import {ViteNodeRunner} from 'vite-node/client'
import {ViteNodeServer} from 'vite-node/server'
import {installSourcemapsSupport} from 'vite-node/source-map'

import {getCliConfig} from '../../config/cli/getCliConfig.js'
import {type CliConfig} from '../../config/cli/types.js'
import {isNotFoundError} from '../../errors/NotFoundError.js'
import {isRecord} from '../../util/isRecord.js'
import * as stubs from './stubs.js'

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

const mockStubs = stubs as Record<string, unknown>
const mockedGlobalThis: Record<string, unknown> = globalThis
for (const key in stubs) {
  if (!(key in mockedGlobalThis)) {
    mockedGlobalThis[key] = mockStubs[key]
  }
}

// Doesn't have to be correct, just need the root path to be
const fakeConfigUrl = pathToFileURL(resolve(rootPath, 'sanity.config.mjs'))

// We'll load `getStudioEnvironmentVariables` from the `sanity/cli` module installed
// relative to where the studio is located, instead of resolving from where this CLI is
// running in, in order to ensure we're using the same version as the studio would.
const sanityCliUrl = await moduleResolve('sanity/cli', fakeConfigUrl)
const {getStudioEnvironmentVariables} = await import(sanityCliUrl.href)
if (typeof getStudioEnvironmentVariables !== 'function') {
  throw new TypeError('Expected `getStudioEnvironmentVariables` from `sanity/cli` to be a function')
}

const defaultViteConfig: InlineConfig = {
  build: {target: 'node'},
  configFile: false, // @todo Should use `vite` prop from `sanity.cli.ts` (if any)
  define: {
    ...getStudioEnvironmentVariables({jsonEncode: true, prefix: 'process.env.'}),
  },
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

// Now we're providing the glue that ensures node-specific loading and execution works.
const node = new ViteNodeServer(server)

// Should make it easier to debug any crashes in the imported code…
installSourcemapsSupport({
  getSourceMap: (source) => node.getSourceMap(source),
})

const runner = new ViteNodeRunner({
  base: server.config.base,
  async fetchModule(id) {
    return node.fetchModule(id)
  },
  resolveId(id, importer) {
    return node.resolveId(id, importer)
  },
  root: server.config.root,
})

// Copied from `vite-node` - it appears that this applies the `define` config from
// vite, but it also takes a surprisingly long time to execute. Not clear at this
// point why this is, so we should investigate whether it's necessary or not.
await runner.executeId('/@vite/env')

await runner.executeId(workerScriptPath)

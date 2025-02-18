import {isMainThread} from 'node:worker_threads'

import {createServer, loadEnv} from 'vite'
import {ViteNodeRunner} from 'vite-node/client'
import {ViteNodeServer} from 'vite-node/server'
import {installSourcemapsSupport} from 'vite-node/source-map'

import * as stubs from './stubs.js'

if (isMainThread) {
  throw new Error('Should be child of thread, not the main thread')
}

const WORKER_SCRIPT_FLAG_INDEX = process.argv.indexOf('--worker-script')
const WORKER_SCRIPT = process.argv[WORKER_SCRIPT_FLAG_INDEX + 1]
if (WORKER_SCRIPT_FLAG_INDEX === -1) {
  throw new Error('No worker script path passed through `--worker-script`')
}

const mockStubs = stubs as Record<string, unknown>
const mockedGlobalThis: Record<string, unknown> = globalThis
for (const key in stubs) {
  if (!(key in mockedGlobalThis)) {
    mockedGlobalThis[key] = mockStubs[key]
  }
}

// Vite will build the files we give it - targetting Node.js instead of the browser.
// We include the inject plugin in order to provide the stubs for the undefined global APIs.
const server = await createServer({
  build: {target: 'node'},
  configFile: false, // @todo Should use `vite` prop from `sanity.cli.ts` (if any)
  logLevel: 'error',
  optimizeDeps: {disabled: true}, // @todo see if this is needed
  root: '/Users/espenh/webdev/cli/examples/basic-studio',
  server: {
    hmr: false,
    watch: null,
  },
})

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

await runner.executeId(WORKER_SCRIPT)

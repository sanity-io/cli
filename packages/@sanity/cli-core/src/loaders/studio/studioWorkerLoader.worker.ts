import {realpath} from 'node:fs/promises'
// eslint-disable-next-line n/no-unsupported-features/node-builtins -- `registerHooks()` needs Node.js 22.15
import {register} from 'node:module'
import {pathToFileURL} from 'node:url'
import {isMainThread, parentPort} from 'node:worker_threads'

import {build, type InlineConfig, loadEnv, mergeConfig, resolveConfig} from 'vite'

import {subdebug} from '../../_exports/debug.js'
import {getCliConfig} from '../../config/cli/getCliConfig.js'
import {type CliConfig} from '../../config/cli/types/cliConfig.js'
import {findStudioConfigPath} from '../../config/util/findStudioConfigPath.js'
import {isNotFoundError} from '../../errors/NotFoundError.js'
import {doImport} from '../../util/doImport.js'
import {getStudioEnvironmentVariables} from '../../util/environment/getStudioEnvironmentVariables.js'
import {setupBrowserStubs} from '../../util/environment/setupBrowserStubs.js'
import {isRecord} from '../../util/isRecord.js'
import {httpsImportsPlugin, sanityExternalsPlugin} from './studioWorkerBundle.js'
import {createOneShotWorkerLifecycle} from './studioWorkerLifecycle.js'
import {type StudioWorkerHooksData} from './studioWorkerLoader.hooks.js'

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
const applicationId = process.env.STUDIO_WORKER_APPLICATION_ID

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

const defaultViteConfig: InlineConfig = {
  build: {target: 'node'},
  configFile: false,
  // Inject environment variables as compile-time constants for Vite
  define: {
    // Config imports must use the same bus identity as the surrounding app bundle.
    ...(applicationId ? {__SANITY_APP_ID__: JSON.stringify(applicationId)} : {}),
    ...Object.fromEntries(
      Object.entries(studioEnvVars).map(([key, value]) => [
        `process.env.${key}`,
        JSON.stringify(value),
      ]),
    ),
  },
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

// Resolve the config like the Vite dev server used to, for the mode, the `.env`
// directory and `process.env.NODE_ENV` (`development` unless set).
debug('Resolving Vite config: %o', viteConfig)
// (`resolveConfig()` modifies the config it is given, so give it a copy)
const {envDir, mode} = await resolveConfig(mergeConfig({}, viteConfig), 'serve')

// Load environment variables from `.env` files in the same way as Vite does.
// Note that Sanity also provides environment variables through `process.env.*` for compat reasons,
// and so we need to do the same here.
// Load ALL env vars from .env files (not just studio-prefixed ones) so non-Sanity-prefixed
// vars (e.g. NEXT_PUBLIC_*, VITE_*) are available via process.env at runtime.
// The ??= on the next line prevents overwriting existing process.env values.
const env = loadEnv(mode, envDir, '')
for (const key in env) {
  process.env[key] ??= env[key]
}

/**
 * Bundles the studio config with Vite, the same way `sanity build` would, except
 * that `sanity`, its dependencies and peers are left for Node.js to load. The
 * user's files, aliases, `define`s, CSS/asset imports and third-party plugins are
 * handled by the bundler, so the result is plain JavaScript that Node.js can run.
 */
async function bundleStudioConfig(studioRootPath: string, configPath: string): Promise<string> {
  const result = await build(
    mergeConfig(viteConfig, {
      build: {
        copyPublicDir: false,
        rolldownOptions: {output: {codeSplitting: false}},
        ssr: configPath,
        // The bundle runs right away, in this very Node.js version
        target: 'esnext',
        write: false,
      },
      mode,
      plugins: [sanityExternalsPlugin(studioRootPath), httpsImportsPlugin()],
    } satisfies InlineConfig),
  )

  const entry = (Array.isArray(result) ? result : [result])
    .flatMap((output) => ('output' in output ? output.output : []))
    .find((chunk) => chunk.type === 'chunk' && chunk.isEntry)
  if (entry?.type !== 'chunk') {
    throw new Error(`Failed to bundle ${configPath}`)
  }
  return entry.code
}

/**
 * Bundles the studio config ahead of the task, and returns the bundle (or the
 * error to throw) keyed by the file URL the task will import it from.
 */
async function getStudioConfigBundles(studioRootPath: string): Promise<StudioWorkerHooksData> {
  let configPath: string
  try {
    configPath = await realpath(await findStudioConfigPath(studioRootPath))
  } catch (error) {
    // Let the task report a missing config the way it always has
    debug('No studio config to bundle: %o', error)
    return {}
  }

  const url = pathToFileURL(configPath).href
  debug('Bundling %s', configPath)
  try {
    return {[url]: {source: await bundleStudioConfig(studioRootPath, configPath)}}
  } catch (error) {
    // Thrown when the task imports the config, like errors from loading it always were.
    // Copied, as Node.js clones it to the hooks thread and it may hold native objects.
    const {message, name, stack} = error instanceof Error ? error : new Error(String(error))
    return {[url]: {error: Object.assign(new Error(message), {name, stack})}}
  }
}

// One-shot tasks (`studioWorkerTask`) resolve on their first message, and the
// main thread historically terminate()d the worker right after — destroying
// the worker's libuv loop while rolldown's native threads were still live.
// The next `napi_call_threadsafe_function` then locked a destroyed mutex and
// aborted the whole process (silent SIGABRT / exit code 134, reliably
// reproduced on macOS). Rolldown is done bundling before the task starts, and
// the main thread no longer terminates one-shot workers at all (see
// `terminateOnSettle` in promisifyWorker).
const bundles = await getStudioConfigBundles(rootPath)
const lifecycle =
  process.env.STUDIO_WORKER_ONE_SHOT === '1' && parentPort
    ? createOneShotWorkerLifecycle({
        // Bundling is over by now
        closeServer: async () => {},
        onCloseError: (error) => debug('Failed to close the studio worker: %o', error),
        parentPort,
      })
    : undefined

try {
  // Imports of the studio config get the bundle, see `studioWorkerLoader.hooks.ts`.
  register<StudioWorkerHooksData>(new URL('studioWorkerLoader.hooks.js', import.meta.url), {
    data: bundles,
  })

  await doImport(workerScriptPath)
} catch (error) {
  // Long-lived workers keep the original behavior: the error surfaces as a
  // Worker 'error' event.
  if (!lifecycle) {
    throw error
  }

  // One-shot workers post a serialized error the main thread rethrows, so the worker exits cleanly (code 0) and the real
  // error (e.g. a broken `sanity.config.ts`) isn't masked by a teardown abort.
  await lifecycle.postError(error)
} finally {
  await lifecycle?.close()
}

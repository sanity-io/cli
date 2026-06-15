import {SANITY_CACHE_DIR} from '@sanity/cli-build/_internal/build'
import {isWorkbenchApp, resolveLocalPackage} from '@sanity/cli-core'
import {createServer, type InlineConfig, type Plugin} from 'vite'
import {z} from 'zod/mini'

import {resolveReactStrictMode} from '../../../util/resolveReactStrictMode.js'
import {devDebug} from '../devDebug.js'
import {interfaceSetId} from '../registration/interfaceSetId.js'
import {
  acquireWorkbenchLock,
  type DevServerManifest,
  getRegisteredServers,
  watchRegistry,
} from '../registry/registry.js'
import {type DevActionOptions} from '../types.js'
import {writeWorkbenchRuntime} from './writeWorkbenchRuntime.js'

const noop = async () => {}

/** Stable per-app key for the registry-watch interface diff. */
const serverKey = (s: DevServerManifest) => `${s.id ?? ''}@${s.host ?? ''}:${s.port}`

const toApplicationsPayload = (servers: DevServerManifest[]) => ({
  applications: servers.map(({host, id, interfaces, manifest, port, projectId, type}) => ({
    host,
    id,
    interfaces,
    manifest,
    port,
    projectId,
    type,
  })),
})

interface WorkbenchDevServerResult {
  close: () => Promise<void>
  httpHost: string | undefined
  workbenchAvailable: boolean
  workbenchPort: number
}

export interface StartWorkbenchOptions extends DevActionOptions {
  httpHost: string | undefined
  httpPort: number
}

/**
 * Start the workbench dev server when federation is enabled and the workbench
 * package is available. If the desired port is already taken — by another
 * workbench instance or an unrelated process — fall back to running without a
 * workbench and let the app/studio dev server claim the configured port.
 */
export async function startWorkbenchDevServer(
  options: StartWorkbenchOptions,
): Promise<WorkbenchDevServerResult> {
  const {cliConfig, httpHost, httpPort: workbenchPort, output, workDir} = options

  // Workbench is opted into solely by calling `unstable_defineApp`.
  if (!isWorkbenchApp(cliConfig?.app)) {
    devDebug('Not a workbench app, skipping workbench dev server')
    return {close: noop, httpHost, workbenchAvailable: false, workbenchPort}
  }

  let workbenchAvailable = false

  try {
    await resolveLocalPackage('sanity/workbench', workDir)
    workbenchAvailable = true
  } catch {
    devDebug('Workbench not available, skipping workbench dev server')
  }

  if (!workbenchAvailable) {
    return {close: noop, httpHost, workbenchAvailable, workbenchPort}
  }

  // Acquire an exclusive lock — only one workbench per machine.
  // Uses O_EXCL which is atomic at the OS level, preventing races when
  // multiple `sanity dev` processes start simultaneously (e.g. via turbo).
  const claim = acquireWorkbenchLock({host: httpHost || 'localhost', port: workbenchPort})
  if (!claim.acquired) {
    const existing = claim.heldBy
    devDebug(
      'Workbench already running at pid %d on port %d, skipping',
      existing?.pid,
      existing?.port,
    )
    return {
      close: noop,
      httpHost: existing?.host ?? httpHost,
      workbenchAvailable: true,
      workbenchPort: existing?.port ?? workbenchPort,
    }
  }
  const workbenchLock = claim.lock

  // The lock is already held; an exception here (runtime-file write failure,
  // invalid remote URL) would otherwise leak it until the next acquire prunes
  // the stale PID.
  let result: Awaited<ReturnType<typeof createWorkbenchViteServer>>
  try {
    result = await createWorkbenchViteServer({
      cliConfig,
      httpHost,
      output,
      workbenchPort,
      workDir,
    })
  } catch (err) {
    workbenchLock.release()
    throw err
  }

  if (!result) {
    workbenchLock.release()
    return {close: noop, httpHost, workbenchAvailable: false, workbenchPort}
  }

  const {actualPort, close} = result
  workbenchLock.updatePort(actualPort)

  return {
    close: async () => {
      workbenchLock.release()
      await close()
    },
    httpHost,
    workbenchAvailable,
    workbenchPort: actualPort,
  }
}

interface CreateWorkbenchViteServerOptions {
  cliConfig: DevActionOptions['cliConfig']
  httpHost: string | undefined
  output: DevActionOptions['output']
  workbenchPort: number
  workDir: string
}

interface CreateWorkbenchViteServerResult {
  actualPort: number
  close: () => Promise<void>
}

async function createWorkbenchViteServer(
  options: CreateWorkbenchViteServerOptions,
): Promise<CreateWorkbenchViteServerResult | undefined> {
  const {cliConfig, httpHost, output, workbenchPort, workDir} = options

  const remoteUrl = parseRemoteUrl(process.env.SANITY_INTERNAL_WORKBENCH_REMOTE_URL)
  const reactStrictMode = resolveReactStrictMode(cliConfig)

  const organizationId = resolveOrganizationId(cliConfig)

  devDebug('Writing workbench runtime files')
  const root = await writeWorkbenchRuntime({
    cwd: workDir,
    organizationId,
    reactStrictMode,
    remoteUrl,
  })

  const viteConfig: InlineConfig = {
    // Custom cache directory so sanity's vite cache doesn't conflict with local vite projects
    cacheDir: `${SANITY_CACHE_DIR}/vite`,
    configFile: false,
    define: {
      __SANITY_STAGING__: process.env.SANITY_INTERNAL_ENV === 'staging',
      'import.meta.env.SANITY_INTERNAL_WORKBENCH_REMOTE_URL': JSON.stringify(remoteUrl),
    },
    logLevel: 'warn',
    mode: 'development',
    optimizeDeps: {
      // Exclude sanity/workbench (and its transitive dep @sanity/workbench)
      // from dep pre-bundling so that `import.meta.hot` is available at
      // runtime — pre-bundled modules do not receive Vite's HMR client
      // injection, which causes the custom HMR events for local application
      // discovery to silently not fire.
      exclude: ['sanity', '@sanity/workbench'],
    },
    plugins: remoteUrl ? [remoteManifestPreloadHeaderPlugin(remoteUrl)] : [],
    resolve: {dedupe: ['react', 'react-dom']},
    root,
    server: {
      host: httpHost,
      port: workbenchPort,
      strictPort: false,
      warmup: {
        clientFiles: ['./workbench.js'],
      },
    },
  }

  devDebug('Creating workbench vite server')
  const server = await createServer(viteConfig)
  try {
    await server.listen()
  } catch (err) {
    await server.close()
    output.warn(
      `Workbench dev server failed to start: ${err instanceof Error ? err.message : String(err)}`,
    )
    return undefined
  }

  // Vite may have picked a different port if the desired one was occupied
  const addr = server.httpServer?.address()
  const actualPort = typeof addr === 'object' && addr ? addr.port : workbenchPort

  // Fire-and-forget: warm the workbench remote's Vite transform pipeline so
  // the first browser request hits a pre-populated module graph.
  if (remoteUrl) {
    fetch(remoteUrl)
      .then((r) => r.body?.cancel())
      .catch(() => {})
    devDebug('Warming workbench remote at %s', remoteUrl)
  }

  server.ws.on('sanity:workbench:get-local-applications', (_, client) => {
    client.send(
      'sanity:workbench:local-applications',
      toApplicationsPayload(getRegisteredServers()),
    )
  })

  // A running app's declared interface set changing (a view/service added or
  // removed in `sanity.cli.ts`) means its remote was rebuilt with new exposes.
  // Module federation has the old remote-entry cached, so an in-place reconcile
  // would load a stale remote (empty panel / no worker) — the page must reload
  // to re-fetch it. A new/removed app, or a manifest-only edit (title/icon),
  // reconciles softly as before. Source-file edits don't change the set, so they
  // stay on the HMR path and never trip a reload here.
  let knownInterfaces = new Map<string, string>()
  const registryWatcher = watchRegistry((servers) => {
    const rebuiltApp = servers.some((s) => {
      const key = serverKey(s)
      return knownInterfaces.has(key) && knownInterfaces.get(key) !== interfaceSetId(s.interfaces)
    })
    knownInterfaces = new Map(servers.map((s) => [serverKey(s), interfaceSetId(s.interfaces)]))

    if (rebuiltApp) {
      server.ws.send({type: 'full-reload'})
      return
    }
    server.ws.send('sanity:workbench:local-applications', toApplicationsPayload(servers))
  })

  return {
    actualPort,
    close: async () => {
      registryWatcher.close()
      await server.close()
    },
  }
}

// Workbench is opted into via `unstable_defineApp`, which carries the
// organization ID. Deliberately no fallback (e.g. resolving it from the
// configured project): the lookup would need an authenticated user and an
// API round-trip on every startup for something the opt-in already declares.
const resolveOrganizationId = (cliConfig: DevActionOptions['cliConfig']): string => {
  if (cliConfig.app?.organizationId) {
    return cliConfig.app.organizationId
  }

  throw new Error(
    'Workbench requires an organization ID. Pass "organizationId" to unstable_defineApp() in sanity.cli.ts.',
  )
}

// Restricts protocol to http(s) so the URL is safe to interpolate into HTML
// attributes and Link headers downstream.
const remoteUrlSchema = z.url({normalize: true, protocol: /^https?$/})

function parseRemoteUrl(value: string | undefined): string | undefined {
  if (!value) return undefined

  const result = remoteUrlSchema.safeParse(value)

  if (!result.success) {
    throw new Error(
      `Invalid SANITY_INTERNAL_WORKBENCH_REMOTE_URL: ${value} (must be an http(s) URL)`,
    )
  }

  return result.data
}

/**
 * Sets a `Link: <remoteUrl>; rel=preload; as=fetch; crossorigin` response header
 * on the index document so the browser can start fetching the Module Federation
 * manifest as soon as response headers arrive — before HTML parsing reaches the
 * in-head preconnect hint. `as=fetch` matches how the federation runtime later
 * retrieves the JSON manifest, allowing the preload entry to satisfy that fetch.
 */
function remoteManifestPreloadHeaderPlugin(remoteUrl: string): Plugin {
  return {
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '/').split('?')[0]
        if (pathname === '/' || pathname === '/index.html') {
          res.setHeader('Link', `<${remoteUrl}>; rel=preload; as=fetch; crossorigin`)
        }
        next()
      })
    },
    name: 'sanity:workbench-remote-preload-header',
  }
}

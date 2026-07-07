import {subdebug} from '@sanity/cli-core/debug'
import {resolveLocalPackage} from '@sanity/cli-core/package-manager'
import {type CliConfig, type Output} from '@sanity/cli-core/types'
import viteReact from '@vitejs/plugin-react'
import {createServer, type InlineConfig, type Plugin, type ViteDevServer} from 'vite'
import {z} from 'zod/mini'

import {isWorkbenchApp} from '../../defineApp.js'
import {createExposesTracker} from './exposesSetId.js'
import {
  acquireWorkbenchLock,
  type DevServerManifest,
  getRegisteredServers,
  readWorkbenchLock,
  watchRegistry,
} from './registry.js'
import {writeWorkbenchRuntime} from './writeWorkbenchRuntime.js'

const devDebug = subdebug('dev')

const noop = async () => {}

// Every server is a local app except a config-only one — an installation config
// with no interfaces (the media library). A server with both lands in both channels.
const isLocalApp = (server: DevServerManifest): boolean => {
  const configOnly = Boolean(server.installationConfigs?.length) && !server.interfaces?.length
  return !configOnly
}

const toApplicationsPayload = (servers: DevServerManifest[]) => ({
  applications: servers
    .filter((server) => isLocalApp(server))
    .map(({host, id, interfaces, manifest, port, projectId, type}) => ({
      host,
      id,
      interfaces,
      manifest,
      port,
      projectId,
      type,
    })),
  installationConfigs: servers.flatMap(({host, installationConfigs, port}) =>
    // Pass through the app-type-specific payload (`fields` for a media library)
    // once the discriminator and transport coordinates are peeled off.
    (installationConfigs ?? []).map(({appType, moduleName, ...config}) => ({
      config,
      moduleName,
      remoteURL: `http://${host}:${port}`,
      type: appType,
    })),
  ),
})

/**
 * Bridge the dev-server registry into a workbench Vite server's HMR channel so
 * the page tracks apps as they come and go. A changed interface set means a
 * rebuilt remote — full-reload to drop the stale remote-entry; otherwise
 * rebroadcast for a soft reconcile. Returns a detach fn.
 */
function attachViteDevServerBridge(server: ViteDevServer): () => void {
  server.ws.on('sanity:workbench:get-local-applications', (_, client) => {
    client.send(
      'sanity:workbench:local-applications',
      toApplicationsPayload(getRegisteredServers()),
    )
  })

  const setTracker = createExposesTracker()
  const registryWatcher = watchRegistry((servers) => {
    if (setTracker.hasChanged(servers)) {
      server.ws.send({type: 'full-reload'})
      return
    }
    server.ws.send('sanity:workbench:local-applications', toApplicationsPayload(servers))
  })

  return () => registryWatcher.close()
}

/**
 * Make the workbench remote act as the machine's workbench: claim the singleton
 * lock so app `sanity dev`s register into it instead of each starting their own,
 * and bridge the registry so the remote shows the local apps. No-op lock if one
 * is already held.
 */
export function startWorkbenchRemoteCoordinator(options: {
  httpHost: string | undefined
  port: number
  server: ViteDevServer
}): {close: () => Promise<void>} {
  const {httpHost, port, server} = options

  const lock = acquireWorkbenchLock({host: httpHost || 'localhost', port})
  if (!lock) {
    const existing = readWorkbenchLock()
    devDebug(
      'Workbench lock already held by pid %d on port %d; bridging the registry without claiming it',
      existing?.pid,
      existing?.port,
    )
  }

  const detachBridge = attachViteDevServerBridge(server)

  return {
    close: async () => {
      detachBridge()
      lock?.release()
    },
  }
}

interface WorkbenchDevServerResult {
  close: () => Promise<void>
  httpHost: string | undefined
  workbenchAvailable: boolean
  workbenchPort: number
}

export interface StartWorkbenchOptions {
  /** Dependency-cache dir for the workbench Vite server, kept apart from the user's own. */
  cacheDir: string
  cliConfig: CliConfig
  httpHost: string | undefined
  httpPort: number
  output: Output
  /** Wrap the workbench in React StrictMode; the CLI resolves it (unset collapses to `false`). */
  reactStrictMode: boolean
  workDir: string
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
  const {
    cacheDir,
    cliConfig,
    httpHost,
    httpPort: workbenchPort,
    output,
    reactStrictMode,
    workDir,
  } = options

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
  const workbenchLock = acquireWorkbenchLock({host: httpHost || 'localhost', port: workbenchPort})
  if (!workbenchLock) {
    const existing = readWorkbenchLock()
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

  // The lock is already held; an exception here (runtime-file write failure,
  // invalid remote URL) would otherwise leak it until the next acquire prunes
  // the stale PID.
  let result: Awaited<ReturnType<typeof createWorkbenchViteServer>>
  try {
    result = await createWorkbenchViteServer({
      cacheDir,
      cliConfig,
      httpHost,
      output,
      reactStrictMode,
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
  cacheDir: string
  cliConfig: CliConfig
  httpHost: string | undefined
  output: Output
  reactStrictMode: boolean
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
  const {cacheDir, cliConfig, httpHost, output, reactStrictMode, workbenchPort, workDir} = options

  const remoteUrl = parseRemoteUrl(process.env.SANITY_INTERNAL_WORKBENCH_REMOTE_URL)

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
    cacheDir,
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
    // viteReact looks inert here — it transforms none of the host's own modules —
    // but it's load-bearing for the remotes. It serves the Fast Refresh runtime at
    // /@react-refresh and injects the preamble that defines window.$RefreshReg$. The
    // federated remotes loaded into this page are react-refresh transformed, so
    // without the preamble they throw "can't detect preamble", and without the
    // runtime their /@react-refresh import (wired by @module-federation/vite's
    // remoteHmr) fails. Dropping it as dead code broke every panel; see #1262.
    plugins: [viteReact(), ...(remoteUrl ? [remoteManifestPreloadHeaderPlugin(remoteUrl)] : [])],
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

  const detachBridge = attachViteDevServerBridge(server)

  return {
    actualPort,
    close: async () => {
      detachBridge()
      await server.close()
    },
  }
}

// Workbench is opted into via `unstable_defineApp`, which carries the
// organization ID. Deliberately no fallback (e.g. resolving it from the
// configured project): the lookup would need an authenticated user and an
// API round-trip on every startup for something the opt-in already declares.
const resolveOrganizationId = (cliConfig: CliConfig): string => {
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

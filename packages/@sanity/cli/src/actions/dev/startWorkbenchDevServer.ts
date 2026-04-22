import {readFile} from 'node:fs/promises'

import {resolveLocalPackage} from '@sanity/cli-core'
import viteReact from '@vitejs/plugin-react'
import {createServer, type InlineConfig} from 'vite'

import {getProjectById} from '../../services/projects.js'
import {getSharedServerConfig} from '../../util/getSharedServerConfig.js'
import {devDebug} from './devDebug.js'
import {
  acquireWorkbenchLock,
  type DevServerManifest,
  getRegisteredServers,
  readWorkbenchLock,
  watchRegistry,
} from './devServerRegistry.js'
import {type DevActionOptions} from './types.js'
import {writeWorkbenchRuntime} from './writeWorkbenchRuntime.js'

const noop = async () => {}

/**
 * Read and parse a studio's `create-manifest.json` from disk. Returns
 * `undefined` when the file is missing or malformed — callers treat the
 * manifest as absent and omit it from the payload, which is the same thing
 * clients see before the first generation completes.
 */
async function readStudioManifest(path: string): Promise<unknown | undefined> {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    devDebug('Failed to read studio manifest at %s: %O', path, err)
    return undefined
  }
}

const toApplicationsPayload = async (servers: DevServerManifest[]) => ({
  applications: await Promise.all(
    servers.map(async ({host, icon, id, manifestPath, port, title, type}) => {
      // Only studios ship a manifest — app bundles don't have one.
      const manifest =
        type === 'studio' && manifestPath ? await readStudioManifest(manifestPath) : undefined
      return {host, icon, id, manifest, port, title, type}
    }),
  ),
})

interface WorkbenchDevServerResult {
  close: () => Promise<void>
  httpHost: string | undefined
  workbenchAvailable: boolean
  workbenchPort: number
}

export async function startWorkbenchDevServer(
  options: DevActionOptions,
): Promise<WorkbenchDevServerResult> {
  const {cliConfig, flags, output, workDir} = options

  const {httpHost, httpPort: workbenchPort} = getSharedServerConfig({
    cliConfig,
    flags: {host: flags.host, port: flags.port},
    workDir,
  })

  if (!cliConfig?.federation?.enabled) {
    devDebug('Federation not enabled, skipping workbench dev server')
    return {close: noop, httpHost, workbenchAvailable: false, workbenchPort}
  }

  const reactStrictMode = process.env.SANITY_STUDIO_REACT_STRICT_MODE
    ? process.env.SANITY_STUDIO_REACT_STRICT_MODE === 'true'
    : Boolean(cliConfig?.reactStrictMode)

  let workbenchAvailable = false

  /**
   * Check whether the `sanity` package has the `workbench` export available. If not,
   * it means an incompatible version of `sanity` is installed and workbench will not
   * be able to start, because the runtime requires the `renderWorkbench` function from
   * that export.
   */
  try {
    await resolveLocalPackage('sanity/workbench', workDir)
    workbenchAvailable = true
  } catch {
    // sanity/workbench not available in this version — skip workbench server
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

  const organizationId = await resolveOrganizationId(cliConfig)

  devDebug('Writing workbench runtime files')
  const root = await writeWorkbenchRuntime({
    cwd: workDir,
    organizationId,
    reactStrictMode,
  })

  let remoteUrl: string | undefined = undefined

  try {
    remoteUrl = new URL(process.env.SANITY_INTERNAL_WORKBENCH_REMOTE_URL || '').toString()
  } catch {
    // Ignore parsing errors, the variable might not be set or might be an invalid URL, in which case we just won't use it
  }

  const viteConfig: InlineConfig = {
    // Define a custom cache directory so that sanity's vite cache
    // does not conflict with any potential local vite projects
    cacheDir: 'node_modules/.sanity/vite',
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
    plugins: [viteReact()],
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
    workbenchLock.release()
    output.warn(
      `Workbench dev server failed to start: ${err instanceof Error ? err.message : String(err)}`,
    )
    return {close: noop, httpHost, workbenchAvailable: false, workbenchPort}
  }

  // Vite may have picked a different port if the desired one was occupied
  const addr = server.httpServer?.address()
  const actualPort = typeof addr === 'object' && addr ? addr.port : workbenchPort

  // Update the lock file with the actual port so other processes can find us
  workbenchLock.updatePort(actualPort)

  // Respond to client requests for the current application list.
  // The payload builder is async (it reads each studio's manifest file from
  // disk), so send the response once the read completes. Errors are logged;
  // the client will retry or wait for the next broadcast.
  server.ws.on('sanity:workbench:get-local-applications', (_, client) => {
    toApplicationsPayload(getRegisteredServers())
      .then((payload) => client.send('sanity:workbench:local-applications', payload))
      .catch((err) => devDebug('Failed to build applications payload: %O', err))
  })

  // Watch the registry and broadcast updates to all connected clients
  const registryWatcher = watchRegistry((servers) => {
    toApplicationsPayload(servers)
      .then((payload) => server.ws.send('sanity:workbench:local-applications', payload))
      .catch((err) => devDebug('Failed to broadcast applications payload: %O', err))
  })

  return {
    close: async () => {
      registryWatcher.close()
      workbenchLock.release()
      await server.close()
    },
    httpHost,
    workbenchAvailable,
    workbenchPort: actualPort,
  }
}

const resolveOrganizationId = async (cliConfig: DevActionOptions['cliConfig']): Promise<string> => {
  if (cliConfig.app?.organizationId) {
    return cliConfig.app.organizationId
  }

  if (cliConfig.api?.projectId) {
    const project = await getProjectById(cliConfig.api.projectId)

    if (project.organizationId) {
      return project.organizationId
    }
  }

  throw new Error(
    'Unable to determine organization ID for workbench runtime. Please ensure that your sanity.json has either "app.organizationId" or "api.projectId" configured.',
  )
}

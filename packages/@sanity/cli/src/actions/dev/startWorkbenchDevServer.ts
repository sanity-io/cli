import {resolveLocalPackage} from '@sanity/cli-core'
import viteReact from '@vitejs/plugin-react'
import {createServer, type InlineConfig} from 'vite'

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

const toApplicationsPayload = (servers: DevServerManifest[]) => ({
  applications: servers.map(({host, port, type}) => ({host, port, type})),
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

  devDebug('Writing workbench runtime files')
  const root = await writeWorkbenchRuntime({
    cwd: workDir,
    organizationId: cliConfig?.app?.organizationId,
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
      'import.meta.env.SANITY_INTERNAL_WORKBENCH_REMOTE_URL': JSON.stringify(remoteUrl),
    },
    logLevel: 'warn',
    mode: 'development',
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

  // Respond to client requests for the current application list
  server.ws.on('sanity:workbench:get-local-applications', (_, client) => {
    client.send(
      'sanity:workbench:local-applications',
      toApplicationsPayload(getRegisteredServers()),
    )
  })

  // Watch the registry and broadcast updates to all connected clients
  const registryWatcher = watchRegistry((servers) => {
    server.ws.send('sanity:workbench:local-applications', toApplicationsPayload(servers))
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

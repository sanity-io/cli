import {resolveLocalPackage} from '@sanity/cli-core'
import viteReact from '@vitejs/plugin-react'
import {createServer, type InlineConfig} from 'vite'

import {
  acquireWorkbenchLock,
  findLiveWorkbench,
  registerDevServer,
  watchRegistry,
} from '../../util/devServerRegistry.js'
import {getSharedServerConfig} from '../../util/getSharedServerConfig.js'
import {devDebug} from './devDebug.js'
import {type DevActionOptions} from './types.js'
import {writeWorkbenchRuntime} from './writeWorkbenchRuntime.js'

const noop = async () => {}

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
  const releaseWorkbenchLock = acquireWorkbenchLock()
  if (!releaseWorkbenchLock) {
    const existingWorkbench = findLiveWorkbench()
    devDebug(
      'Workbench already running at pid %d on port %d, skipping',
      existingWorkbench?.pid,
      existingWorkbench?.port,
    )
    return {
      close: noop,
      httpHost: existingWorkbench?.host ?? httpHost,
      workbenchAvailable: true,
      workbenchPort: existingWorkbench?.port ?? workbenchPort,
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
    remoteUrl = URL.parse(process.env.SANITY_INTERNAL_WORKBENCH_REMOTE_URL || '')?.toString()
  } catch {
    // Ignore parsing errors, the variable might not be set or might be an invalid URL, in which case we just won't use it
  }

  const viteConfig: InlineConfig = {
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
    releaseWorkbenchLock()
    output.warn(
      `Workbench dev server failed to start: ${err instanceof Error ? err.message : String(err)}`,
    )
    return {close: noop, httpHost, workbenchAvailable: false, workbenchPort}
  }

  // Vite may have picked a different port if the desired one was occupied
  const addr = server.httpServer?.address()
  const actualPort = typeof addr === 'object' && addr ? addr.port : workbenchPort

  // Register this workbench in the dev server registry
  const cleanupManifest = registerDevServer({
    host: httpHost || 'localhost',
    port: actualPort,
    type: 'workbench',
    workDir,
  })

  // Watch the registry and broadcast non-workbench servers to connected clients
  const registryWatcher = watchRegistry((servers) => {
    const remotes = servers.filter((s) => s.type !== 'workbench')
    server.hot.send('sanity:workbench:local-applications', {servers: remotes})
  })

  return {
    close: async () => {
      registryWatcher.close()
      cleanupManifest()
      releaseWorkbenchLock()
      await server.close()
    },
    httpHost,
    workbenchAvailable,
    workbenchPort: actualPort,
  }
}

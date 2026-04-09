import {resolveLocalPackage} from '@sanity/cli-core'
import viteReact from '@vitejs/plugin-react'
import {createServer, type InlineConfig} from 'vite'

import {getSharedServerConfig} from '../../util/getSharedServerConfig.js'
import {devDebug} from './devDebug.js'
import {type DevActionOptions} from './types.js'
import {writeWorkbenchRuntime} from './writeWorkbenchRuntime.js'

interface WorkbenchDevServerResult {
  httpHost: string | undefined
  workbenchAvailable: boolean
  workbenchPort: number

  close?: () => Promise<void>
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
    return {httpHost, workbenchAvailable: false, workbenchPort}
  }

  const reactStrictMode = process.env.SANITY_STUDIO_REACT_STRICT_MODE
    ? process.env.SANITY_STUDIO_REACT_STRICT_MODE === 'true'
    : Boolean(cliConfig?.reactStrictMode)

  let workbenchAvailable = false
  try {
    await resolveLocalPackage('@sanity/workbench', workDir)
    workbenchAvailable = true
  } catch {
    // @sanity/workbench not available in this version — skip workbench server
  }

  if (!workbenchAvailable) {
    return {httpHost, workbenchAvailable, workbenchPort}
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
    output.warn(
      `Workbench dev server failed to start: ${err instanceof Error ? err.message : String(err)}`,
    )
    return {httpHost, workbenchAvailable: false, workbenchPort}
  }

  // Vite may have picked a different port if the desired one was occupied
  const addr = server.httpServer?.address()
  const actualPort = typeof addr === 'object' && addr ? addr.port : workbenchPort

  return {
    close: () => server.close(),
    httpHost,
    workbenchAvailable,
    workbenchPort: actualPort,
  }
}

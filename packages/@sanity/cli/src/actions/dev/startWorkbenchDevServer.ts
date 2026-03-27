import path from 'node:path'
import {pathToFileURL} from 'node:url'

import viteReact from '@vitejs/plugin-react'
import {moduleResolve} from 'import-meta-resolve'
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
    moduleResolve('sanity/workbench', pathToFileURL(path.join(workDir, 'package.json')))
    workbenchAvailable = true
  } catch {
    // sanity/workbench not available in this version — skip workbench server
  }

  if (!workbenchAvailable) {
    return {httpHost, workbenchAvailable, workbenchPort}
  }

  devDebug('Writing workbench runtime files')
  const root = await writeWorkbenchRuntime({cwd: workDir, reactStrictMode})

  const viteConfig: InlineConfig = {
    configFile: false,
    logLevel: 'warn',
    mode: 'development',
    plugins: [viteReact()],
    resolve: {dedupe: ['react', 'react-dom']},
    root,
    server: {host: httpHost, port: workbenchPort, strictPort: true},
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

  return {
    close: () => server.close(),
    httpHost,
    workbenchAvailable,
    workbenchPort,
  }
}

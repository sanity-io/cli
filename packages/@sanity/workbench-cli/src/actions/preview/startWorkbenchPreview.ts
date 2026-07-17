import {styleText} from 'node:util'

import {type CliConfig, findProjectRoot, type Output} from '@sanity/cli-core'

import {createServerLifecycle, toDisplayHost} from '../../util/serverOrchestration.js'
import {deriveConfigs, deriveInterfaces} from '../dev/deriveInterfaces.js'
import {type DevServerManifest, registerDevServer} from '../dev/registry.js'
import {startWorkbenchDevServer} from '../dev/startWorkbenchDevServer.js'
import {serveBuiltRemote} from './serveBuiltRemote.js'

export interface StartWorkbenchPreviewOptions {
  /** Directory for the workbench Vite server's dependency cache. */
  cacheDir: string
  /** CLI-domain `app.id`/`deployment.appId` deprecation check, run before registering. */
  checkForDeprecatedAppId: () => void
  cliConfig: CliConfig
  /** Extract the project manifest to inline into the registry (studio-vs-app handled by the CLI). */
  extractManifest: (params: {
    configPath: string
    workDir: string
  }) => Promise<DevServerManifest['manifest']>
  httpHost: string
  httpPort: number
  isApp: boolean
  /** The built `dist` directory to serve as the federation remote. */
  outDir: string
  output: Output
  reactStrictMode: boolean
  workDir: string
}

/**
 * `sanity start` for a workbench app: serve a production build the way dev serves
 * a live one. The same singleton workbench shell renders it and the same registry
 * advertises it — only the remote differs, static files from the build output
 * instead of a live Vite dev server. There's no config watcher or rebuild: a
 * build is fixed, so nothing re-syncs.
 *
 * A running workbench claims the configured port, so the built remote binds the
 * next one. Without one the remote takes the configured port and announces its
 * own URL.
 */
export async function startWorkbenchPreview(
  options: StartWorkbenchPreviewOptions,
): Promise<{close: () => Promise<void>}> {
  const {
    cacheDir,
    checkForDeprecatedAppId,
    cliConfig,
    extractManifest,
    httpHost,
    httpPort,
    isApp,
    outDir,
    output,
    reactStrictMode,
    workDir,
  } = options

  const {close, closers, installSignalHandlers} = createServerLifecycle()

  const workbench = await startWorkbenchDevServer({
    cacheDir,
    cliConfig,
    httpHost,
    httpPort,
    mode: 'preview',
    output,
    reactStrictMode,
    workDir,
  })
  closers.push(workbench.close)

  const remotePort = workbench.workbenchAvailable ? workbench.workbenchPort + 1 : httpPort

  const remote = await serveBuiltRemote({
    cacheDir,
    httpHost,
    httpPort: remotePort,
    outDir,
    workDir,
  }).catch(async (err) => {
    await close()
    throw err
  })
  closers.push(remote.close)

  try {
    // Callers provide CLI-only validation and manifest extraction to keep them
    // out of workbench-cli.
    checkForDeprecatedAppId()
    const configPath = (await findProjectRoot(workDir)).path
    const registration = registerDevServer({
      configs: deriveConfigs(cliConfig.app),
      host: remote.host,
      // A local app is identified by where it's served, matching `sanity dev`.
      id: `${remote.host}-${remote.port}`,
      interfaces: deriveInterfaces(cliConfig.app, {isApp}),
      manifest: await extractManifest({configPath, workDir}),
      manifestUpdatedAt: new Date().toISOString(),
      port: remote.port,
      projectId: cliConfig?.api?.projectId,
      type: isApp ? 'coreApp' : 'studio',
      workDir,
    })
    closers.push(async () => registration.release())
  } catch (err) {
    await close()
    throw err
  }

  if (workbench.workbenchAvailable) {
    const workbenchUrl = `http://${toDisplayHost(workbench.httpHost)}:${workbench.workbenchPort}`
    output.log(
      `Workbench preview server started at ${styleText(['blue', 'underline'], workbenchUrl)} (serving build on port ${remote.port})`,
    )
  } else {
    const remoteUrl = `http://${toDisplayHost(remote.host)}:${remote.port}`
    output.log(`Serving build at ${styleText(['blue', 'underline'], remoteUrl)}`)
  }

  installSignalHandlers()

  return {close}
}

import {readFile} from 'node:fs/promises'
import path from 'node:path'
import {styleText} from 'node:util'

import {type CliConfig, findProjectRoot, type Output} from '@sanity/cli-core'

import {buildAppId, SANITY_APP_ID_FILE} from '../../appId.js'
import {isWorkbenchApp} from '../../defineApp.js'
import {deriveInterfaces} from '../../deriveInterfaces.js'
import {readAppIcon, toUrlPath} from '../../readAppIcon.js'
import {type ResolvedWorkbenchApp, resolveWorkbenchApp} from '../../resolveWorkbenchApp.js'
import {resolveWorkbenchConfig} from '../../resolveWorkbenchConfig.js'
import {createServerLifecycle, toDisplayHost} from '../../util/serverOrchestration.js'
import {deriveConfigs} from '../dev/deriveConfigs.js'
import {
  dashboardPath,
  type DevServerManifest,
  findServerConflict,
  localAppIdentity,
  registerDevServer,
} from '../dev/registry.js'
import {startWorkbenchDevServer} from '../dev/startWorkbenchDevServer.js'
import {serveBuiltApplication} from './serveBuiltApplication.js'

export interface StartWorkbenchPreviewOptions {
  /** Directory for the workbench Vite server's dependency cache. */
  cacheDir: string
  /** CLI-domain `app.id`/`deployment.appId` deprecation check, run before registering. */
  checkForDeprecatedAppId: () => void
  cliConfig: CliConfig
  /** Extract the project manifest to inline into the registry (studio-vs-app handled by the CLI). */
  extractManifest: (params: {
    applicationId?: string
    configPath: string
    /** Where the preview serves the app's icon. */
    iconUrl?: string
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

  // Resolved before any server starts, so a bad icon path, a project that isn't set
  // up for the Dashboard, or one it already serves fails with nothing to tear down.
  const {id, workbenchApp} = await resolvePreviewTarget(cliConfig, outDir)
  const applicationId = workbenchApp ? cliConfig.deployment?.appId : undefined
  const organizationId = cliConfig.app?.organizationId
  const conflict = findServerConflict({
    applicationId,
    id,
    organizationId,
    slug: workbenchApp?.slug,
  })

  if (conflict) {
    throw new Error(`${conflict}. Stop that server first.`)
  }

  const app = isWorkbenchApp(cliConfig.app) ? cliConfig.app : undefined
  const appIcon = isApp ? app?.icon : undefined
  const iconUrlPath = (iconPath: string) =>
    `/${toUrlPath(workDir, path.resolve(workDir, iconPath))}`
  const icons = await Promise.all(
    [appIcon, ...(app?.views ?? []).map((view) => ('icon' in view ? view.icon : undefined))]
      .filter((iconPath) => iconPath !== undefined)
      .map(async (iconPath) => ({
        ...(await readAppIcon(workDir, iconPath)),
        path: iconUrlPath(iconPath),
      })),
  )

  const {close, closers, installSignalHandlers} = createServerLifecycle()

  const workbench = await startWorkbenchDevServer({
    cacheDir,
    cliConfig,
    httpHost,
    httpPort,
    output,
    reactStrictMode,
    workDir,
  })
  closers.push(workbench.close)

  const remotePort = workbench.workbenchAvailable ? workbench.workbenchPort + 1 : httpPort

  const remote = await serveBuiltApplication({
    cacheDir,
    httpHost,
    httpPort: remotePort,
    icons,
    outDir,
    workDir,
  }).catch(async (err) => {
    await close()
    throw err
  })
  closers.push(remote.close)

  let dashboardAppPath: string | undefined
  try {
    // Callers provide CLI-only validation and manifest extraction to keep them
    // out of workbench-cli.
    checkForDeprecatedAppId()
    const configPath = (await findProjectRoot(workDir)).path
    const configs = await deriveConfigs(cliConfig)
    const interfaces = deriveInterfaces(cliConfig.app, {
      iconUrl: (iconPath) => `http://${remote.host}:${remote.port}${iconUrlPath(iconPath)}`,
      isApp,
    })
    const registration = registerDevServer({
      applicationId,
      configs,
      host: remote.host,
      id,
      interfaces,
      manifest: await extractManifest({
        applicationId: id,
        configPath,
        iconUrl: appIcon && `http://${remote.host}:${remote.port}${iconUrlPath(appIcon)}`,
        workDir,
      }),
      manifestUpdatedAt: new Date().toISOString(),
      organizationId,
      port: remote.port,
      projectId: cliConfig?.api?.projectId,
      ...(workbenchApp && localAppIdentity(workbenchApp)),
      type: isApp ? 'coreApp' : 'studio',
      workDir,
    })
    closers.push(async () => registration.release())
    dashboardAppPath = dashboardPath({
      id,
      interfaces,
      slug: workbenchApp?.slug,
      type: isApp ? 'coreApp' : 'studio',
    })
  } catch (err) {
    await close()
    throw err
  }

  if (workbench.workbenchAvailable) {
    const appUrl = `http://${toDisplayHost(workbench.httpHost)}:${workbench.workbenchPort}${dashboardAppPath ?? ''}`
    output.log(`Dashboard preview server started at ${styleText(['blue', 'underline'], appUrl)}`)
  } else {
    const remoteUrl = `http://${toDisplayHost(remote.host)}:${remote.port}`
    output.log(`Serving build at ${styleText(['blue', 'underline'], remoteUrl)}`)
  }

  installSignalHandlers()

  return {close}
}

/**
 * What the preview registers: a config under its own id namespace (as in dev),
 * or the workbench app under the id its build inlined.
 */
async function resolvePreviewTarget(
  cliConfig: CliConfig,
  outDir: string,
): Promise<{id: string; workbenchApp?: ResolvedWorkbenchApp}> {
  const config = resolveWorkbenchConfig(cliConfig)

  if (config) {
    return {id: `config:${config.appType}`}
  }

  const workbenchApp = resolveWorkbenchApp(cliConfig)

  if (!workbenchApp) {
    throw new Error(
      '`sanity start` was invoked in an application that is not set up for the Dashboard',
    )
  }

  return {id: (await readInlinedAppId(outDir)) ?? (await buildAppId(workbenchApp)), workbenchApp}
}

/** The id the build inlined into its bundle, or undefined when absent. */
async function readInlinedAppId(outDir: string): Promise<string | undefined> {
  try {
    return (await readFile(path.join(outDir, SANITY_APP_ID_FILE), 'utf8')).trim() || undefined
  } catch {
    return undefined
  }
}

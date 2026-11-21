import {styleText} from 'node:util'

import {type CliConfig, type Output} from '@sanity/cli-core'
import {isWorkbenchApp} from '@sanity/cli-core/workbench'

import {createServerLifecycle, toDisplayHost} from '../../util/serverOrchestration.js'
import {formatSummary} from '../summary.js'
import {type AppServerResult, startAppServerSupervisor} from './appServerSupervisor.js'
import {bindDevShortcuts} from './bindDevShortcuts.js'
import {fetchDevSummaryDetails, waitForDevSummaryDetails} from './devSummary.js'
import {type DevServerManifest} from './registry.js'
import {startDevServerRegistration} from './startDevServerRegistration.js'
import {
  startWorkbenchDevServer,
  startWorkbenchRemoteCoordinator,
} from './startWorkbenchDevServer.js'

export interface StartWorkbenchDevOptions {
  /** Directory for the workbench Vite server's dependency cache. */
  cacheDir: string
  /** CLI-domain `app.id`/`deployment.appId` deprecation check, run before registering. */
  checkForDeprecatedAppId: () => void
  cliConfig: CliConfig
  /** Extract the project manifest to inline into the registry (studio-vs-app handled by the CLI). */
  extractManifest: (params: {
    applicationId?: string
    configPath: string
    /** Where the app server serves the app's icon. */
    iconUrl?: string
    workDir: string
  }) => Promise<DevServerManifest['manifest']>
  httpHost: string | undefined
  httpPort: number
  isApp: boolean
  output: Output
  reactStrictMode: boolean
  /** Start the app/studio dev server — the CLI owns the server, this orchestrates it. */
  startAppServer: (params: {
    cliConfig: CliConfig
    httpPort: number
    isRestarting?: boolean
    quiet?: boolean
  }) => Promise<AppServerResult>
  workDir: string
}

/**
 * Orchestrate the dev servers a workbench project needs: a singleton workbench
 * Vite server plus the app/studio dev server it renders, wired to the dev-server
 * registry so view/web worker edits re-sync live.
 *
 * A running workbench claims the configured port, so the app server binds the
 * next one. If the workbench can't start (package or port unavailable), the app
 * server falls back to the configured port and announces its own URL, exactly as
 * a plain `sanity dev` would.
 */
export async function startWorkbenchDev(
  options: StartWorkbenchDevOptions,
): Promise<{close: () => Promise<void>}> {
  const {
    cacheDir,
    checkForDeprecatedAppId,
    cliConfig,
    extractManifest,
    httpHost,
    httpPort,
    isApp,
    output,
    reactStrictMode,
    startAppServer,
    workDir,
  } = options

  // The remote can't render itself, so it runs as a plain app server (not the
  // shell) that still bridges the registry.
  if (process.env.SANITY_INTERNAL_IS_WORKBENCH_REMOTE === 'true') {
    const remote = await startAppServer({cliConfig, httpPort})
    if (!remote.started) return {close: async () => {}}

    const coordinator = startWorkbenchRemoteCoordinator({server: remote.server})

    return {
      close: async () => {
        await coordinator.close()
        await remote.close()
      },
    }
  }

  // Unwound in reverse on any failure or on close(): the watcher stops before
  // the app server, and the supervisor waits out an in-flight rebuild.
  const {close, closers, installSignalHandlers} = createServerLifecycle()
  const startedAt = Date.now()
  const app = isWorkbenchApp(cliConfig.app) ? cliConfig.app : undefined
  const organizationId = cliConfig.app?.organizationId
  const details = fetchDevSummaryDetails({
    idOrSlug: app && (cliConfig.deployment?.appId ?? app.slug),
    organizationId,
  })

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

  // A running workbench owns the configured port; the app server takes the next.
  // Without one it claims the configured port and announces its own URL.
  const appPort = workbench.workbenchAvailable ? workbench.workbenchPort + 1 : httpPort

  const supervised = await startAppServerSupervisor({
    cliConfig,
    start: (config, {isRestarting} = {}) =>
      startAppServer({
        cliConfig: config,
        httpPort: appPort,
        isRestarting,
        quiet: workbench.workbenchAvailable,
      }),
    workDir,
  }).catch(async (err) => {
    await close()
    throw err
  })

  if (!supervised.started) {
    // The app server already reported why (e.g. missing organization id). Hand
    // back a close that releases the workbench lock; nothing else came up.
    return {close}
  }
  const {supervisor} = supervised
  closers.push(supervisor.close)

  let dashboardAppPath: string | undefined
  try {
    // The deprecated-id check and manifest extractor are CLI-domain, injected here.
    checkForDeprecatedAppId()
    const registration = await startDevServerRegistration({
      cliConfig,
      extractManifest,
      isApp,
      onInterfaceSetChange: () => supervisor.rebuild(),
      output,
      server: supervisor.server,
      workDir,
    })
    closers.push(registration.close)
    dashboardAppPath = registration.path
  } catch (err) {
    // Registration runs after both servers are up; a failure here would leak the
    // workbench lock and dev servers without this teardown.
    await close()
    throw err
  }

  const durationMs = Date.now() - startedAt
  const {deployment, organizationName} = workbench.workbenchAvailable
    ? await waitForDevSummaryDetails(details)
    : {}

  installSignalHandlers()

  if (workbench.workbenchAvailable) {
    const url = `http://${toDisplayHost(workbench.httpHost)}:${workbench.workbenchPort}${dashboardAppPath ?? ''}`
    let version = ''

    if (deployment) {
      const date = new Date(deployment.createdAt).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
      const by = deployment.deployedBy ? ` by ${deployment.deployedBy}` : ''
      version = `local preview ${styleText('dim', `· deployed ${date}${by}`)}`
    } else if (deployment === null) {
      version = `local preview ${styleText('dim', '· not deployed')}`
    }

    output.log(
      formatSummary({
        durationMs,
        heading: 'Sanity Dashboard ready',
        isApp,
        organization: organizationName ?? organizationId,
        title: app?.title,
        url,
        version,
      }),
    )

    const quit = () => void close().then(() => process.exit(0))
    closers.push(bindDevShortcuts({output, quit, url}))
  }

  return {close}
}

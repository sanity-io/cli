import {styleText} from 'node:util'

import {startAppDevServer} from './startAppDevServer.js'
import {startStudioDevServer} from './startStudioDevServer.js'
import {startWorkbenchDevServer} from './startWorkbenchDevServer.js'
import {type DevActionOptions} from './types.js'

export async function devAction(options: DevActionOptions): Promise<{close?: () => Promise<void>}> {
  const {output} = options

  const {
    close: closeWorkbenchServer,
    httpHost,
    workbenchAvailable,
    workbenchPort,
  } = await startWorkbenchDevServer(options)

  // Start app/studio dev server: use workbenchPort + 1 if workbench feature is
  // available (reserves the configured port for it), otherwise use the original port
  const desiredAppPort = closeWorkbenchServer === undefined ? workbenchPort : workbenchPort + 1
  const appOptions: DevActionOptions = {
    ...options,
    flags: {...options.flags, port: String(desiredAppPort)},
    workbenchAvailable,
  }

  const {close: closeAppDevServer, server} = options.isApp
    ? await startAppDevServer(appOptions)
    : await startStudioDevServer(appOptions)

  // server is undefined only when startAppDevServer exits early (e.g. missing orgId);
  // in that case the process is already exiting so no workbench needed.
  if (!server) {
    return {
      close: async () => {
        await closeWorkbenchServer?.()
      },
    }
  }

  if (closeWorkbenchServer !== undefined) {
    const appPort = server.config.server.port
    const workbenchUrl = `http://${httpHost || 'localhost'}:${workbenchPort}`
    output.log(
      `Workbench dev server started at ${styleText(['blue', 'underline'], workbenchUrl)} (app on port ${appPort})`,
    )
  }

  return {
    close: async () => {
      // Run both closes independently — a failing workbench close must not prevent
      // the primary server from shutting down
      await Promise.allSettled([closeWorkbenchServer?.(), closeAppDevServer?.()])
    },
  }
}

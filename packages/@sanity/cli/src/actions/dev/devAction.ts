import {startAppDevServer} from './startAppDevServer.js'
import {startStudioDevServer} from './startStudioDevServer.js'
import {startWorkbenchDevServer} from './startWorkbenchDevServer.js'
import {type DevActionOptions} from './types.js'

export async function devAction(options: DevActionOptions): Promise<{close?: () => Promise<void>}> {
  const [{close: closeWorkbenchDevServer}, {close: closeApplicationDevServer}] = await Promise.all([
    startWorkbenchDevServer(options),
    options.isApp ? startAppDevServer(options) : startStudioDevServer(options),
  ])

  return {
    async close() {
      await Promise.all([closeWorkbenchDevServer?.(), closeApplicationDevServer?.()])
    },
  }
}

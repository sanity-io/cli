import {type CliConfig, getCliConfigUncached, type Output, subdebug} from '@sanity/cli-core'

import {isWorkbenchApp, isWorkbenchConfig} from '../../defineApp.js'
import {watchCliConfig} from './watchCliConfig.js'

const devDebug = subdebug('dev')

const noop = async () => {}

interface WatchForWorkbenchOptInOptions {
  /** Stop the plain dev server, freeing its port for the workbench. */
  closePlainServer: () => Promise<void>
  output: Output
  startWorkbench: (cliConfig: CliConfig) => Promise<{close: () => Promise<void>}>
  workDir: string
}

/**
 * Hand a running plain `sanity dev` over to the workbench once `sanity.cli.*`
 * opts in with `defineApplication`, so upgrading doesn't need a restart.
 *
 * Costs one directory watch until the handover, which then stops it. A failed
 * handover leaves the watch running so the next save retries.
 *
 * @returns A close for whichever servers are running.
 */
export function watchForWorkbenchOptIn({
  closePlainServer,
  output,
  startWorkbench,
  workDir,
}: WatchForWorkbenchOptInOptions): {close: () => Promise<void>} {
  let closeCurrent = closePlainServer
  let handover: Promise<void> | undefined
  let closed = false

  const watcher = watchCliConfig({
    dir: workDir,
    filenames: ['sanity.cli.js', 'sanity.cli.ts'],
    onChange: async (filename) => {
      // Mid-edit saves often don't load; the next save retries.
      const cliConfig = await getCliConfigUncached(workDir).catch((err) => {
        devDebug('Could not load CLI config while watching for the workbench opt-in: %O', err)
      })
      if (closed || !cliConfig) return
      if (!isWorkbenchApp(cliConfig.app) && !isWorkbenchConfig(cliConfig.app)) return

      output.log(`${filename} changed, restarting dev server in the local Dashboard`)
      handover = (async () => {
        await closeCurrent()
        closeCurrent = noop
        const workbench = await startWorkbench(cliConfig)
        closeCurrent = workbench.close
      })()

      try {
        await handover
        watcher.close()
      } catch (err) {
        output.warn(
          `Failed to start dev server: ${err instanceof Error ? err.message : String(err)}`,
        )
        output.log(`No dev server is running. Save ${filename} to try again.`)
      } finally {
        handover = undefined
      }
    },
    onError: (err) => devDebug('CLI config watcher error: %O', err),
  })

  return {
    close: async () => {
      closed = true
      watcher.close()
      // A handover in flight still assigns its close; wait so it isn't orphaned.
      await handover?.catch(() => {})
      await closeCurrent()
    },
  }
}

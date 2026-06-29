import {getCliConfigUncached} from '@sanity/cli-core/config'
import {type CliConfig} from '@sanity/cli-core/types'
import {type ViteDevServer} from 'vite'

/**
 * Minimal shape the supervisor needs back from a started app/studio dev server.
 * The not-started arm is reserved for expected early exits the server already
 * reported (e.g. a missing organization id) — a failure to *boot* still throws.
 */
export type AppServerResult =
  | {close: () => Promise<void>; server: ViteDevServer; started: true}
  | {reason: string; started: false}

/** Start the app/studio dev server for a given config (port + URL intent baked in by the caller). */
export type StartAppServer = (cliConfig: CliConfig) => Promise<AppServerResult>

const noop = async () => {}

export interface AppServerSupervisor {
  /** Stop the server once, waiting out any rebuild already in flight. */
  close: () => Promise<void>
  /** Tear down the running server and bring it back up with a freshly-loaded config. */
  rebuild: () => Promise<ViteDevServer>
  /** The currently-live dev server; re-points after a rebuild. */
  readonly server: ViteDevServer
}

/**
 * Own the app/studio dev server's lifecycle behind the dev-server registry seam.
 *
 * Adding or removing a view/service rebuilds the federation remote: its
 * module-federation `exposes` map and codegen artifacts are computed once at
 * server start, so a newly-declared interface has no expose until the server is
 * recreated — `server.restart()` can't do it (it reuses the inline config).
 * `rebuild` therefore tears the server down and starts a fresh one with a
 * reloaded config; the registry watcher calls it when the interface set changes.
 *
 * Returns the not-started result verbatim when the initial boot is an expected
 * early exit, so the caller can skip the rest of the orchestration.
 */
export async function startAppServerSupervisor(options: {
  cliConfig: CliConfig
  start: StartAppServer
  workDir: string
}): Promise<{reason: string; started: false} | {started: true; supervisor: AppServerSupervisor}> {
  const {cliConfig, start, workDir} = options

  const initial = await start(cliConfig)
  if (!initial.started) return {reason: initial.reason, started: false}

  // `closeCurrent` repoints at the replacement only once a rebuild succeeds, so a
  // failed rebuild (old server already closed) leaves nothing for close() to re-close.
  let server = initial.server
  let closeCurrent = initial.close
  let closed = false
  // close() waits on this so a rebuild racing teardown can't orphan the replacement.
  // Rejections are the watcher's (warn + retry); the tracked copy is swallowed.
  let rebuildInFlight: Promise<unknown> = Promise.resolve()

  const runRebuild = async (): Promise<ViteDevServer> => {
    // Refuse once shutting down — a config save in the teardown window must not
    // boot a replacement nobody owns.
    if (closed) throw new Error('Dev server is shutting down')
    const freshConfig = await getCliConfigUncached(workDir)
    await closeCurrent()
    closeCurrent = noop
    const result = await start(freshConfig)
    if (!result.started) {
      // The server already reported why (e.g. organizationId was removed).
      throw new Error('Dev server did not restart after the view/service change')
    }
    server = result.server
    closeCurrent = result.close
    return server
  }

  return {
    started: true,
    supervisor: {
      async close() {
        closed = true
        await rebuildInFlight
        await closeCurrent()
      },
      rebuild() {
        const rebuild = runRebuild()
        rebuildInFlight = rebuild.catch(() => {})
        return rebuild
      },
      get server() {
        return server
      },
    },
  }
}

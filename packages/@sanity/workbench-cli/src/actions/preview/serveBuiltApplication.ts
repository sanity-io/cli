import {subdebug} from '@sanity/cli-core'
import {type InlineConfig, preview} from 'vite'

import {checkBuiltOutput} from '../deploy/checkBuiltOutput.js'

const previewDebug = subdebug('preview')

export interface BuiltApplicationServer {
  close: () => Promise<void>
  /** Routable host the remote is reachable at, for the registry's remote URL. */
  host: string
  /** Port Vite bound — may differ from the requested one under non-strict ports. */
  port: number
}

/**
 * Serve a built workbench app's `dist` as static files over a Vite `preview`
 * server, so its `mf-manifest.json` + `remote-entry.js` are reachable exactly as
 * a live `sanity dev` remote would be — the workbench then federates it in.
 *
 * A missing federation build is re-tagged `BUILD_NOT_FOUND` so the command
 * surfaces the same "run sanity build" hint the studio preview path shows.
 */
export async function serveBuiltApplication(options: {
  cacheDir: string
  httpHost: string
  httpPort: number
  outDir: string
  workDir: string
}): Promise<BuiltApplicationServer> {
  const {cacheDir, httpHost, httpPort, outDir, workDir} = options

  try {
    await checkBuiltOutput(outDir)
  } catch (err) {
    if (err instanceof Error) err.name = 'BUILD_NOT_FOUND'
    throw err
  }

  const config: InlineConfig = {
    // Serve at the root so `mf-manifest.json` and its `publicPath: 'auto'` chunks
    // resolve under the registered remote URL.
    base: '/',
    // Needed for vite to serve `outDir` itself rather than `outDir/dist`.
    build: {outDir},
    cacheDir,
    configFile: false,
    logLevel: 'warn',
    mode: 'production',
    preview: {host: httpHost, port: httpPort, strictPort: false},
    root: workDir,
  }

  previewDebug('Serving built remote from %s', outDir)
  const server = await preview(config)

  const addr = server.httpServer.address()
  const port = typeof addr === 'object' && addr ? addr.port : httpPort

  return {
    // Drop idle keep-alive sockets so shutdown doesn't stall on a browser that
    // kept the connection open — otherwise `close` waits out the teardown grace.
    // `closeAllConnections` isn't on Vite's `HttpServer` type, but is on the
    // underlying node server (18.2+); the optional call tolerates its absence.
    close: () =>
      new Promise((resolve, reject) => {
        server.httpServer.close((err) => (err ? reject(err) : resolve()))
        ;(server.httpServer as {closeAllConnections?: () => void}).closeAllConnections?.()
      }),
    host: httpHost,
    port,
  }
}

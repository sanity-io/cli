import fs from 'node:fs'
import path from 'node:path'

import {type WorkbenchExposes} from '../../../resolveWorkbenchApp.js'

/**
 * React APIs only the generated render-contract modules import — the SPA
 * bootstrap (`getEntryModule`) and every render artifact (`renderRemote`)
 * `createRoot` from `react-dom/client` and `createElement` from `react`. No
 * app/interface source imports `react-dom/client` itself, so scanning `entries`
 * never surfaces it; every workbench app depends on react/react-dom, so both
 * always resolve.
 */
const RENDER_CONTRACT_DEPS = ['react', 'react-dom/client']

/** Extensions an import-style source path may omit, in resolution order. */
const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs']

/**
 * Resolve an import-style source path to the file on disk. The app `entry`
 * defaults to the extensionless `./src/App` (and a user may omit the extension
 * anywhere), which the runtime imports fine through Vite's resolver — but
 * `optimizeDeps.entries` is matched against the filesystem, so an extensionless
 * path never matches and its deps go unscanned. Try the path as-is, then the
 * common source extensions; fall back to the input so an already-resolved path
 * (or a genuinely missing one) passes through unchanged.
 */
function resolveSourceFile(absPath: string): string {
  if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) return absPath
  for (const extension of SOURCE_EXTENSIONS) {
    if (fs.existsSync(`${absPath}${extension}`)) return `${absPath}${extension}`
  }
  return absPath
}

/**
 * Dep pre-bundling inputs for a workbench app's dev server.
 *
 * Vite's dep scanner crawls from the app's HTML entry, which reaches only the
 * app's `entry` (or a studio's config) — never the federation `exposes` (dock
 * views, worker services, media-library config fields), which the host loads
 * dynamically at runtime. So a dep imported only by an exposed module (e.g.
 * `sanity/workbench` in a service or view) escapes the startup scan; Vite
 * discovers it on first request, re-optimizes, and full-page reloads — which
 * flakes Playwright in e2e.
 *
 * Point `entries` at the source of every interface: the app `entry` (or, for a
 * studio, its config), plus each view, service, and installation-config source.
 * `entries` follows real import statements, so it covers whatever those sources
 * transitively use — correct subpaths and all — with no hand-maintained dep
 * list, and never crashes on an unresolvable name the way a bad `include` entry
 * does. Each source is resolved to its on-disk file so an extensionless path
 * (like the default `./src/App`) still matches `entries`' filesystem glob.
 *
 * @param cwd - Project root; `entries` are returned relative to it.
 * @param appSources - Absolute paths to the app's `entry` and/or studio config.
 * @param exposes - The app's declared views/services/config.
 * @internal
 */
export function workbenchOptimizeDeps(options: {
  appSources: readonly string[]
  cwd: string
  exposes?: WorkbenchExposes
}): {entries: string[]; include: string[]} {
  const {appSources, cwd, exposes} = options

  const interfaceSources = [
    ...(exposes?.views ?? []).map((view) => view.src),
    ...(exposes?.services ?? []).map((service) => service.src),
    ...(exposes?.config?.fields ?? []).map((field) => field.src),
  ].map((src) => path.resolve(cwd, src))

  const entries = [...appSources, ...interfaceSources].map((absPath) => {
    const resolved = resolveSourceFile(absPath)
    return path.relative(cwd, resolved).split(path.sep).join('/')
  })

  return {
    entries: [...new Set(entries)],
    include: [...RENDER_CONTRACT_DEPS],
  }
}

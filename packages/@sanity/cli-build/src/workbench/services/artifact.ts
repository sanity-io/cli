import {type GeneratedArtifact} from '../artifact.js'
import {SERVICE_CONTRACT_VERSION, type ServiceType} from '../contract.js'

/** Subdirectory under the federation runtime dir where service artifacts live. */
const SERVICES_DIR_NAME = 'services'

const SERVICE_TYPES: readonly ServiceType[] = ['worker']

/**
 * A service to generate a worker artifact for. The `src` file default-exports
 * an `unstable_defineService(...)` result; the build emits a self-contained Web
 * Worker bundle plus a loader module that hands the host its URL.
 * @public
 */
export interface ServiceArtifact {
  /** Service name, unique within the app. */
  name: string
  /** Path to the service `src` file, relative to the app root (or absolute). */
  src: string
  /** Service type, e.g. `"worker"`. */
  type: string
}

/**
 * Expand each service into its two generated artifacts: a self-contained worker
 * bundle (imports the user's `src`, runs the callback) and a loader module the
 * host loads to read the worker's URL. Only the loader is a federation expose —
 * the host reaches the worker bundle through it, never directly.
 */
export function serviceArtifacts(services: readonly ServiceArtifact[]): GeneratedArtifact[] {
  return services
    .filter((service) => (SERVICE_TYPES as readonly string[]).includes(service.type))
    .flatMap((service): GeneratedArtifact[] => {
      const dir = `${SERVICES_DIR_NAME}/${service.name}`
      return [
        {
          path: `${dir}/worker.js`,
          source: ({resolveImport}) =>
            serviceWorkerArtifactSource({
              importPath: resolveImport(service.src),
              service,
            }),
        },
        {
          expose: `./${dir}`,
          path: `${dir}/index.js`,
          source: () => serviceLoaderArtifactSource({service}),
        },
      ]
    })
}

/**
 * Source for one service's **worker** bundle — the Web Worker entry. Imports
 * the user's `unstable_defineService` result and runs its callback with the
 * service's own declaration (mirroring how a view component receives its
 * `view`), then wires the returned disposer to the host's terminate message.
 * Crashes — and the worker's `console.*`, which is patched to forward to the
 * host — are surfaced through the host logger (the host owns logging; a worker's
 * own console isn't visible in the page DevTools anyway).
 */
function serviceWorkerArtifactSource(input: {
  importPath: string
  service: {name: string; type: string}
}): string {
  return `\
// This file is auto-generated on 'sanity build' / 'sanity dev'
// Modifications to this file are automatically discarded
import service from ${JSON.stringify(input.importPath)}

const SERVICE = { type: ${JSON.stringify(input.service.type)}, name: ${JSON.stringify(input.service.name)} }

// Bridge the worker's console to the host. A worker's own console isn't visible
// in the page DevTools, so patch console.* to forward each call as a message
// the host re-emits through the workbench logger — any console.log in the
// service (or its deps) just shows up in the page console.
const __format = (arg) => {
  if (typeof arg === 'string') return arg
  try { return JSON.stringify(arg) } catch (_) { return String(arg) }
}
for (const __level of ['log', 'info', 'warn', 'error', 'debug']) {
  const __native = typeof console[__level] === 'function' ? console[__level].bind(console) : () => {}
  console[__level] = (...args) => {
    __native(...args)
    try {
      self.postMessage({ kind: 'workbench.worker.log', payload: { level: __level, message: args.map(__format).join(' ') } })
    } catch (_) {}
  }
}

let dispose
try {
  const result = service.run({ service: SERVICE })
  if (typeof result === 'function') dispose = result
} catch (error) {
  self.postMessage({ kind: 'workbench.worker.error', payload: { message: String(error) } })
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.kind === 'workbench.worker.terminate') {
    try { dispose && dispose() } finally { self.close() }
  }
})

self.addEventListener('error', (event) => {
  self.postMessage({ kind: 'workbench.worker.error', payload: { message: String(event.message || event) } })
})

// An async run callback (or async work it kicks off) rejects without hitting
// the synchronous try/catch above; module workers surface that as
// 'unhandledrejection' on self, not 'error'. Forward it so the crash reaches
// the host either way.
self.addEventListener('unhandledrejection', (event) => {
  self.postMessage({ kind: 'workbench.worker.error', payload: { message: String(event.reason) } })
})
`
}

/**
 * Source for one service's **loader** — the module-federation expose. Hands the
 * host the worker bundle's URL (via Vite `?worker&url`) plus the service's
 * type/version.
 *
 * A URL (not an inlined worker) on purpose: the host can't `new Worker()` it
 * directly — cross-origin in dev/prod, and `?worker&inline` only self-contains
 * the worker in a build, not under `sanity dev`. Instead the host bootstraps a
 * same-origin worker that dynamically `import()`s this URL, so the worker
 * resolves its own imports against the app origin. Works in dev and build alike.
 *
 * No HMR boundary: a worker lives in its own `?worker&url` module graph with no
 * accepting importer, so Vite full-reloads the page on a `src` edit (which
 * re-loads the worker with the new code) — in-place worker HMR isn't possible.
 */
function serviceLoaderArtifactSource(input: {service: {name: string; type: string}}): string {
  return `\
// This file is auto-generated on 'sanity build' / 'sanity dev'
// Modifications to this file are automatically discarded
import workerUrl from './worker.js?worker&url'

/** URL of the worker bundle, on the app's origin. */
export const url = workerUrl
/** Service type and contract version, surfaced for the host to dispatch on. */
export const type = ${JSON.stringify(input.service.type)}
export const name = ${JSON.stringify(input.service.name)}
export const version = ${SERVICE_CONTRACT_VERSION}
`
}

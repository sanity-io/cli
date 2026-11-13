import {WEB_WORKER_CONTRACT_VERSION, type WebWorkerType} from '../../../contract.js'
import {type GeneratedArtifact} from '../artifact.js'

/** The worker bus client the generated `worker.js` imports; see the extension-artifacts plugin's alias. */
export const WORKER_BUS_ENTRY = '@sanity/workbench-cli/_internal_worker_bus'

/** Subdirectory under the federation runtime dir for web worker artifacts; hosts load them as `services/<name>`. */
const WEB_WORKERS_DIR_NAME = 'services'

const WEB_WORKER_TYPES: readonly WebWorkerType[] = ['worker']

/**
 * A web worker to generate artifacts for. The `src` file default-exports
 * a worker function or an `unstable_defineService(...)` result; the build emits
 * a self-contained Web Worker bundle plus a loader module that hands the host its URL.
 * @internal
 */
export interface WebWorkerArtifact {
  /** Web worker name, unique within the app. */
  name: string
  /** Path to the web worker `src` file, relative to the app root (or absolute). */
  src: string
  /** Web worker type, e.g. `"worker"`. */
  type: string
}

/**
 * Expand each web worker into its two generated artifacts: a self-contained worker
 * bundle (imports the user's `src`, runs the callback) and a loader module the
 * host loads to read the worker's URL. Only the loader is a federation expose —
 * the host reaches the worker bundle through it, never directly.
 */
export function webWorkerArtifacts(workers: readonly WebWorkerArtifact[]): GeneratedArtifact[] {
  return workers
    .filter((worker) => (WEB_WORKER_TYPES as readonly string[]).includes(worker.type))
    .flatMap((worker): GeneratedArtifact[] => {
      const dir = `${WEB_WORKERS_DIR_NAME}/${worker.name}`
      return [
        {
          path: `${dir}/worker.js`,
          source: ({resolveImport}) =>
            webWorkerArtifactSource({
              importPath: resolveImport(worker.src),
              worker,
            }),
        },
        {
          expose: `./${dir}`,
          path: `${dir}/index.js`,
          source: () => webWorkerLoaderArtifactSource({worker}),
        },
      ]
    })
}

/**
 * Source for one web worker's **worker** bundle — the Web Worker entry. Imports
 * the user's worker function or `unstable_defineService` result and runs it with the
 * web worker's own declaration (mirroring how a view component receives its
 * `view`) and a message bus client (`workerBus.ts`), then wires the returned
 * disposer to the host's terminate message.
 * Crashes — and the worker's `console.*`, which is patched to forward to the
 * host — are surfaced through the host logger (the host owns logging; a worker's
 * own console isn't visible in the page DevTools anyway).
 */
function webWorkerArtifactSource(input: {
  importPath: string
  worker: {name: string; type: string}
}): string {
  return `\
// This file is auto-generated on 'sanity build' / 'sanity dev'
// Modifications to this file are automatically discarded
import worker from ${JSON.stringify(input.importPath)}
import { createWorkerBus } from ${JSON.stringify(WORKER_BUS_ENTRY)}

const WORKER = { type: ${JSON.stringify(input.worker.type)}, name: ${JSON.stringify(input.worker.name)} }

// Bridge the worker's console to the host. A worker's own console isn't visible
// in the page DevTools, so patch console.* to forward each call as a message
// the host re-emits through the workbench logger — any console.log in the
// worker (or its deps) just shows up in the page console.
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

const { bus, close: closeBus, receive: receiveBus } = createWorkerBus()

let dispose
try {
  // Backwards compatibility: an \`unstable_defineService\` result passes the worker as \`service\`. Remove in SDK-3210.
  const result = worker.run ? worker.run({ bus, service: WORKER }) : worker({ bus, worker: WORKER })
  if (typeof result === 'function') dispose = result
} catch (error) {
  self.postMessage({ kind: 'workbench.worker.error', payload: { message: String(error) } })
}

self.addEventListener('message', (event) => {
  if (!event.data) return
  if (event.data.kind === 'workbench.worker.terminate') {
    // Close the bus first: the host has disconnected, so the disposer's bus calls must fail at once.
    closeBus()
    try { dispose && dispose() } finally { self.close() }
  } else {
    receiveBus(event.data)
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
 * Source for one web worker's **loader** — the module-federation expose. Hands the
 * host the worker bundle's URL (via Vite `?worker&url`) plus the web worker's
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
function webWorkerLoaderArtifactSource(input: {worker: {name: string; type: string}}): string {
  return `\
// This file is auto-generated on 'sanity build' / 'sanity dev'
// Modifications to this file are automatically discarded
import workerUrl from './worker.js?worker&url'

/** URL of the worker bundle, on the app's origin. */
export const url = workerUrl
/** Web worker type and contract version, surfaced for the host to dispatch on. */
export const type = ${JSON.stringify(input.worker.type)}
export const name = ${JSON.stringify(input.worker.name)}
export const version = ${WEB_WORKER_CONTRACT_VERSION}
`
}

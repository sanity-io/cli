import {describe, expect, test, vi} from 'vitest'

import {type ServiceCallback, unstable_defineService} from '../../../../webWorker.js'
import {type WebWorkerArtifact, webWorkerArtifacts} from '../artifact.js'

// Test stub for the build-supplied `resolveImport` — turns an app `src` into a
// specifier relative to the artifact. The emitter only threads it through
// `JSON.stringify`, so the exact resolver shape isn't what these tests pin.
const resolveImport = (src: string) => `../../${src.replace('./', '')}`

const webWorker = (overrides: Partial<WebWorkerArtifact> = {}): WebWorkerArtifact => ({
  name: 'unread',
  src: './src/unread.ts',
  type: 'worker',
  ...overrides,
})

describe('webWorkerArtifacts', () => {
  test('expands a web worker into a worker bundle and a loader', () => {
    const artifacts = webWorkerArtifacts([webWorker({name: 'unread'})])
    expect(artifacts.map((artifact) => artifact.path)).toEqual([
      'services/unread/worker.js',
      'services/unread/index.js',
    ])
    // Only the loader is a federation expose; the host reaches the worker through it.
    expect(artifacts.map((artifact) => artifact.expose)).toEqual([undefined, './services/unread'])
  })

  // Pin the whole worker bundle: the console bridge and crash forwarding are
  // load-bearing and not caught by a fragment check. The `src` is threaded
  // through `resolveImport`.
  test('emits the worker bundle that runs the user worker and forwards crashes', () => {
    const [worker] = webWorkerArtifacts([webWorker({name: 'unread', src: './src/unread.ts'})])
    expect(worker.source({resolveImport})).toMatchInlineSnapshot(`
      "// This file is auto-generated on 'sanity build' / 'sanity dev'
      // Modifications to this file are automatically discarded
      import worker from "../../src/unread.ts"
      import { createWorkerBus } from "@sanity/workbench-cli/_internal_worker_bus"

      const WORKER = { type: "worker", name: "unread" }

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
      "
    `)
  })

  // Pin the whole loader: it hands the host the worker URL plus the type/name/version
  // it dispatches on. The snapshot hard-codes `version = 1`, so a contract-version bump
  // lands here as a red test and a reviewable diff instead of shipping silently.
  test('emits the loader that hands the host the worker URL, type, name, and version', () => {
    const [, loader] = webWorkerArtifacts([webWorker({name: 'unread'})])
    expect(loader.source({resolveImport})).toMatchInlineSnapshot(`
      "// This file is auto-generated on 'sanity build' / 'sanity dev'
      // Modifications to this file are automatically discarded
      import workerUrl from './worker.js?worker&url'

      /** URL of the worker bundle, on the app's origin. */
      export const url = workerUrl
      /** Web worker type and contract version, surfaced for the host to dispatch on. */
      export const type = "worker"
      export const name = "unread"
      export const version = 1
      "
    `)
  })

  test('drops web workers whose type has no artifact builder', () => {
    expect(webWorkerArtifacts([webWorker({type: 'cron'})])).toEqual([])
  })

  test('expands many web workers, preserving order', () => {
    const artifacts = webWorkerArtifacts([webWorker({name: 'unread'}), webWorker({name: 'sync'})])
    expect(artifacts.map((artifact) => artifact.path)).toEqual([
      'services/unread/worker.js',
      'services/unread/index.js',
      'services/sync/worker.js',
      'services/sync/index.js',
    ])
  })

  test('returns nothing for an empty web worker list', () => {
    expect(webWorkerArtifacts([])).toEqual([])
  })

  test('runs a default-exported function with the bus and its worker', () => {
    const run = vi.fn()
    const {bus} = startWorker(run)
    expect(run).toHaveBeenCalledWith({bus, worker: {name: 'unread', type: 'worker'}})
    expect(run.mock.calls[0][0].bus).toBe(bus)
  })

  test('runs an unstable_defineService result with the bus and its service', () => {
    const run = vi.fn<ServiceCallback>()
    const {bus} = startWorker(unstable_defineService('worker', run))
    expect(run).toHaveBeenCalledWith({bus, service: {name: 'unread', type: 'worker'}})
    expect(run.mock.calls[0][0].bus).toBe(bus)
  })

  test('closes the bus, calls the disposer, then closes the worker on workbench.worker.terminate', () => {
    const dispose = vi.fn()
    const {closeBus, self, terminate} = startWorker(() => dispose)
    terminate()
    expect(dispose).toHaveBeenCalledOnce()
    expect(closeBus.mock.invocationCallOrder[0]).toBeLessThan(dispose.mock.invocationCallOrder[0])
    expect(self.close).toHaveBeenCalledOnce()
  })
})

/** Evaluates the generated worker entry with `defaultExport` as the user's `src` default export. */
function startWorker(defaultExport: unknown) {
  const bus = {emit: vi.fn()}
  const closeBus = vi.fn()
  const listeners: Record<string, (event: unknown) => void> = {}
  const self = {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener
    },
    close: vi.fn(),
    postMessage: vi.fn(),
  }
  const [worker] = webWorkerArtifacts([webWorker()])
  const body = worker.source({resolveImport}).replaceAll(/^import .*$/gm, '')
  // `console` is shadowed so the entry's console bridge doesn't patch the test runner's console.
  new Function('worker', 'createWorkerBus', 'self', 'console', body)(
    defaultExport,
    () => ({bus, close: closeBus, receive: () => {}}),
    self,
    {},
  )
  return {
    bus,
    closeBus,
    self,
    terminate: () => listeners.message({data: {kind: 'workbench.worker.terminate'}}),
  }
}

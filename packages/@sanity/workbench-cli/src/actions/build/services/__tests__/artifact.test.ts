import {describe, expect, test} from 'vitest'

import {type ServiceArtifact, serviceArtifacts} from '../artifact.js'

// Test stub for the build-supplied `resolveImport` — turns an app `src` into a
// specifier relative to the artifact. The emitter only threads it through
// `JSON.stringify`, so the exact resolver shape isn't what these tests pin.
const resolveImport = (src: string) => `../../${src.replace('./', '')}`

const service = (overrides: Partial<ServiceArtifact> = {}): ServiceArtifact => ({
  name: 'unread',
  src: './src/unread.ts',
  type: 'worker',
  ...overrides,
})

describe('serviceArtifacts', () => {
  test('expands a worker service into a worker bundle and a loader', () => {
    const artifacts = serviceArtifacts([service({name: 'unread'})])
    expect(artifacts.map((artifact) => artifact.path)).toEqual([
      'services/unread/worker.js',
      'services/unread/index.js',
    ])
    // Only the loader is a federation expose; the host reaches the worker through it.
    expect(artifacts.map((artifact) => artifact.expose)).toEqual([undefined, './services/unread'])
  })

  // Pin the whole worker bundle: the console bridge, the `service.run` call, and
  // the dispose-before-close terminate sequence are all load-bearing and none is
  // caught by a fragment check. The `src` is threaded through `resolveImport`.
  test('emits the worker bundle that runs the user service and forwards crashes', () => {
    const [worker] = serviceArtifacts([service({name: 'unread', src: './src/unread.ts'})])
    expect(worker.source({resolveImport})).toMatchInlineSnapshot(`
      "// This file is auto-generated on 'sanity build' / 'sanity dev'
      // Modifications to this file are automatically discarded
      import service from "../../src/unread.ts"

      const SERVICE = { type: "worker", name: "unread" }

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
      "
    `)
  })

  // Pin the whole loader: it hands the host the worker URL plus the type/name/version
  // it dispatches on. The snapshot hard-codes `version = 1`, so a contract-version bump
  // lands here as a red test and a reviewable diff instead of shipping silently.
  test('emits the loader that hands the host the worker URL, type, name, and version', () => {
    const [, loader] = serviceArtifacts([service({name: 'unread'})])
    expect(loader.source({resolveImport})).toMatchInlineSnapshot(`
      "// This file is auto-generated on 'sanity build' / 'sanity dev'
      // Modifications to this file are automatically discarded
      import workerUrl from './worker.js?worker&url'

      /** URL of the worker bundle, on the app's origin. */
      export const url = workerUrl
      /** Service type and contract version, surfaced for the host to dispatch on. */
      export const type = "worker"
      export const name = "unread"
      export const version = 1
      "
    `)
  })

  test('drops services whose type has no artifact builder', () => {
    expect(serviceArtifacts([service({type: 'cron'})])).toEqual([])
  })

  test('expands many worker services, preserving order', () => {
    const artifacts = serviceArtifacts([service({name: 'unread'}), service({name: 'sync'})])
    expect(artifacts.map((artifact) => artifact.path)).toEqual([
      'services/unread/worker.js',
      'services/unread/index.js',
      'services/sync/worker.js',
      'services/sync/index.js',
    ])
  })

  test('returns nothing for an empty service list', () => {
    expect(serviceArtifacts([])).toEqual([])
  })
})

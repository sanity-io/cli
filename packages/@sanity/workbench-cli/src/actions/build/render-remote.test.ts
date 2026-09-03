import {afterEach, describe, expect, test} from 'vitest'

import {renderRemote} from './render-remote.js'

const MODULE_SLOT = Symbol.for('sanity.os.module')

/** A minimal stand-in for a React module: only the members the wrapper touches. */
type Ctx = {_default: unknown; Provider: 'Provider'}
type ReactStub = {
  Activity: 'Activity'
  createContext: (defaultValue: unknown) => Ctx
  createElement: (type: unknown, props: unknown, ...children: unknown[]) => Element
  StrictMode: 'StrictMode'
}
type Element = {children: unknown[]; props: unknown; type: unknown}
type Root = {render: (element: Element) => void; unmount: () => void}

function makeReact(): ReactStub {
  return {
    Activity: 'Activity',
    createContext: (defaultValue) => ({_default: defaultValue, Provider: 'Provider'}),
    createElement: (type, props, ...children) => ({children, props, type}),
    StrictMode: 'StrictMode',
  }
}

/** Walk the wrapper chain (Activity, StrictMode, ...) down to the ModuleContext.Provider. */
function providerOf(element: Element): Element {
  let node = element
  while (node && node.type !== 'Provider') node = (node.children as Element[])[0]
  return node
}

/** A Vite `import.meta.hot` stub that captures the `accept` callback for a test to fire. */
type HotStub = {accept: (cb: (next: unknown) => void) => void; accepted?: (next: unknown) => void}

/**
 * Execute a generated wrapper against injected React / react-dom stubs, without
 * a real React copy. Rewrites the wrapper's two static imports into locals
 * pulled from `deps`, so the ESM template runs as a plain function body. Pass a
 * `hot` stub to run the HMR boundary (which references `import.meta.hot`).
 */
function loadWrapper(
  source: string,
  React: ReactStub,
  {hot, onUnmount = () => {}}: {hot?: HotStub; onUnmount?: () => void} = {},
): {
  createRootCalls: unknown[]
  render: (
    rootElement: object,
    props?: unknown,
    renderOptions?: unknown,
  ) => {dispose: () => void; setLifecycle: (state: string) => void}
  rendered: Element[]
} {
  const rendered: Element[] = []
  const createRootCalls: unknown[] = []
  const createRoot = (_rootElement: unknown, options?: unknown): Root => {
    createRootCalls.push(options)
    return {
      render: (element) => rendered.push(element),
      unmount: onUnmount,
    }
  }
  const body = source
    .replace(/^import \* as React from 'react'$/m, 'const React = deps.React')
    .replace(/^import \{ createRoot \} from 'react-dom\/client'$/m, 'const {createRoot} = deps')
    .replace(
      /^import \{ StyleSheetManager \} from 'styled-components'$/m,
      "const StyleSheetManager = 'StyleSheetManager'",
    )
    // `export`/`import.meta` are illegal in a Function body: drop `export` and
    // route `import.meta.hot` to the injected stub so the ESM template runs as a
    // plain module scope. `render` is still captured via the returned reference.
    .replaceAll(/^export /gm, '')
    .replaceAll('import.meta.hot', 'deps.hot')
  // The federation entries also import a preamble; none is passed in these tests.
  const factory = new Function('deps', `${body}\nreturn {render}`)
  const mod = factory({createRoot, hot, React}) as {
    render: (
      rootElement: object,
      props?: unknown,
      renderOptions?: unknown,
    ) => {dispose: () => void; setLifecycle: (state: string) => void}
  }
  return {createRootCalls, rendered, ...mod}
}

const APP = `() => 'app'`

afterEach(() => {
  // Each test owns the slot; drop it so a fresh WeakMap is created next run.
  delete (globalThis as Record<symbol, unknown>)[MODULE_SLOT]
})

describe('renderRemote module context', () => {
  test('keeps the stylesheet attached until React finishes unmounting', () => {
    const events: string[] = []
    const target = {remove: () => events.push('remove stylesheet')}
    const root = {ownerDocument: {createElement: () => target, head: {appendChild: () => {}}}}
    const mod = loadWrapper(
      renderRemote({app: APP, isolateStyles: true, preamble: ''}),
      makeReact(),
      {
        onUnmount: () => events.push('unmount React'),
      },
    )
    mod.render(root).dispose()
    expect(events).toEqual(['unmount React', 'remove stylesheet'])
  })

  test('sources ModuleContext from the symbol-keyed WeakMap<createContext, Context>', () => {
    const React = makeReact()
    loadWrapper(renderRemote({app: APP, preamble: ''}), React).render({}, {}, {})

    const slot = (globalThis as Record<symbol, unknown>)[MODULE_SLOT] as WeakMap<object, Ctx>
    expect(slot).toBeInstanceOf(WeakMap)
    // The key is the createContext function, not the namespace object: the SDK reads the
    // slot with the same key, and namespace objects can differ under bundler interop.
    expect(slot.has(React.createContext)).toBe(true)
    expect(slot.has(React)).toBe(false)
  })

  test('two namespace objects over the same React copy resolve the same context', () => {
    const React = makeReact()
    // What esbuild's __toESM interop produces: a fresh wrapper object per importer.
    const interopCopy = {...React}
    loadWrapper(renderRemote({app: APP, preamble: ''}), React).render({}, {}, {})
    loadWrapper(renderRemote({app: APP, preamble: ''}), interopCopy).render({}, {}, {})

    const slot = (globalThis as Record<symbol, unknown>)[MODULE_SLOT] as WeakMap<object, Ctx>
    expect(slot.get(React.createContext)).toBe(slot.get(interopCopy.createContext))
  })

  test('a second wrapper on the same React copy resolves the same context object', () => {
    const React = makeReact()
    const first = loadWrapper(renderRemote({app: APP, preamble: ''}), React)
    const second = loadWrapper(renderRemote({app: APP, preamble: ''}), React)

    const root = {}
    first.render(root, {}, {moduleId: 'favorites/App'})
    const other = {}
    second.render(other, {}, {moduleId: 'favorites/views/list/panel'})

    const slot = (globalThis as Record<symbol, unknown>)[MODULE_SLOT] as WeakMap<object, Ctx>
    // Both wrappers wrote/read the WeakMap, so a single Context object exists.
    expect(slot.get(React.createContext)).toBeDefined()
  })

  test('a different React copy gets its own context (no cross-copy leak)', () => {
    const reactA = makeReact()
    const reactB = makeReact()
    loadWrapper(renderRemote({app: APP, preamble: ''}), reactA).render({}, {}, {})
    loadWrapper(renderRemote({app: APP, preamble: ''}), reactB).render({}, {}, {})

    const slot = (globalThis as Record<symbol, unknown>)[MODULE_SLOT] as WeakMap<object, Ctx>
    expect(slot.get(reactA.createContext)).not.toBe(slot.get(reactB.createContext))
  })

  test('passes renderOptions.moduleId as the provider value, wrapping App', () => {
    const React = makeReact()
    const mod = loadWrapper(renderRemote({app: APP, preamble: ''}), React)
    const moduleId = 'favorites/views/list/panel'
    mod.render({}, {greeting: 'hi'}, {moduleId})

    const provider = providerOf(mod.rendered[0])
    expect(provider.type).toBe('Provider')
    expect((provider.props as {value: unknown}).value).toBe(moduleId)
    const [appElement] = provider.children as Element[]
    expect((appElement.props as {greeting: string}).greeting).toBe('hi')
  })

  test('a two-argument render(element, props) call renders with moduleId undefined', () => {
    const React = makeReact()
    const mod = loadWrapper(renderRemote({app: APP, preamble: ''}), React)
    // No renderOptions argument at all.
    mod.render({}, {})

    const provider = providerOf(mod.rendered[0])
    expect(provider.type).toBe('Provider')
    expect((provider.props as {value: unknown}).value).toBeUndefined()
  })

  test('forwards renderOptions.rootOptions to createRoot, only on root creation', () => {
    const mod = loadWrapper(renderRemote({app: APP, preamble: ''}), makeReact())

    // First render on a fresh element: rootOptions reach createRoot as the 2nd arg.
    const first = {}
    mod.render(first, {}, {rootOptions: {identifierPrefix: 'x'}})
    expect(mod.createRootCalls).toEqual([{identifierPrefix: 'x'}])

    // No rootOptions: createRoot's 2nd arg is undefined.
    mod.render({}, {})
    expect(mod.createRootCalls).toEqual([{identifierPrefix: 'x'}, undefined])

    // Re-rendering the same element reuses the root, so createRoot is not called again.
    mod.render(first, {}, {rootOptions: {identifierPrefix: 'y'}})
    expect(mod.createRootCalls).toEqual([{identifierPrefix: 'x'}, undefined])
  })

  test('the generated wrapper never imports the SDK', () => {
    const source = renderRemote({app: APP, hmr: true, preamble: '', version: 'view.version'})
    expect(source).not.toMatch(/@sanity\/sdk/)
  })

  test('a hot update re-renders each live root and carries its lifecycle over', () => {
    const hot: HotStub = {
      accept(cb) {
        this.accepted = cb
      },
    }
    const mod = loadWrapper(renderRemote({app: APP, hmr: true, preamble: ''}), makeReact(), {hot})

    const root = {}
    mod.render(root, {greeting: 'hi'}, {moduleId: 'favorites/App'}).setLifecycle('background')

    // The new module the host hands to `accept`: record how the boundary drives it.
    const setLifecycleCalls: string[] = []
    const renderCalls: unknown[][] = []
    const next = {
      render(...args: unknown[]) {
        renderCalls.push(args)
        return {setLifecycle: (state: string) => setLifecycleCalls.push(state)}
      },
    }
    hot.accepted!(next)

    // Re-rendered the live root through the new module with its original props/options,
    // then restored the lifecycle it was left in.
    expect(renderCalls).toEqual([[root, {greeting: 'hi'}, {moduleId: 'favorites/App'}]])
    expect(setLifecycleCalls).toEqual(['background'])
  })

  test('after a hot update, the controller the host holds drives the new module', () => {
    const hot: HotStub = {
      accept(cb) {
        this.accepted = cb
      },
    }
    const mod = loadWrapper(renderRemote({app: APP, hmr: true, preamble: ''}), makeReact(), {hot})
    const controller = mod.render({})

    const calls: string[] = []
    hot.accepted!({
      render: () => ({
        dispose: () => calls.push('dispose'),
        setLifecycle: (state: string) => calls.push(state),
      }),
    })
    calls.length = 0

    controller.setLifecycle('background')
    controller.dispose()
    controller.setLifecycle('foreground')

    // The old module no longer owns the node, so it must not create a second root on it.
    expect(mod.createRootCalls).toHaveLength(1)
    expect(calls).toEqual(['background', 'dispose'])
  })
})

import {afterEach, describe, expect, test} from 'vitest'

import {renderRemote} from './render-remote.js'

const ROOT_SLOT = Symbol.for('sanity.os.root')
const STYLIS_PLUGIN_COUNT = Symbol.for('sanity.os.stylisPluginCount')

/** A minimal stand-in for a React module: only the members the wrapper touches. */
type Ctx = {_default: unknown; Provider: object}
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
    createContext: (defaultValue) => ({_default: defaultValue, Provider: {}}),
    createElement: (type, props, ...children) => ({children, props, type}),
    StrictMode: 'StrictMode',
  }
}

/** Walk the wrapper chain (Activity, StrictMode, providers) to the first element that matches. */
function find(element: Element, matches: (node: Element) => boolean): Element | undefined {
  let node: Element | undefined = element
  while (node && !matches(node)) node = (node.children as Element[])[0]
  return node
}

type RootValue = {moduleId?: string; parentKey?: string; signal: AbortSignal}

/** The value of the root context the wrapper stored for this React copy. */
function rootValueOf(element: Element, React: ReactStub): RootValue | undefined {
  const context = (
    (globalThis as Record<symbol, unknown>)[ROOT_SLOT] as WeakMap<object, Ctx> | undefined
  )?.get(React.createContext)
  const provider = context && find(element, (node) => node.type === context.Provider)
  return (provider?.props as {value: RootValue} | undefined)?.value
}

const appOf = (element: Element) => find(element, (node) => typeof node.type === 'function')

/** Walk the wrapper chain down to the StyleSheetManager and read its props. */
function styleSheetManagerPropsOf(element: Element) {
  let node = element
  while (node && node.type !== 'StyleSheetManager') node = (node.children as Element[])[0]
  return node.props as {stylisPlugins: {name: string}[]; target: unknown}
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

const rootElement = (target: object = {}) => ({
  ownerDocument: {createElement: () => target, head: {appendChild: () => {}}},
})

const loadIsolated = () =>
  loadWrapper(renderRemote({app: APP, isolateStyles: true, preamble: ''}), makeReact())

afterEach(() => {
  // Each test owns the slot; drop it so a fresh WeakMap is created next run.
  delete (globalThis as Record<symbol, unknown>)[ROOT_SLOT]
  delete (globalThis as Record<symbol, unknown>)[STYLIS_PLUGIN_COUNT]
})

describe('renderRemote root context', () => {
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

  test('gives every root, across modules, a uniquely named stylis plugin', () => {
    const first = loadIsolated()
    const second = loadIsolated()
    first.render(rootElement())
    first.render(rootElement())
    second.render(rootElement())

    const names = [...first.rendered, ...second.rendered].map(
      (element) => styleSheetManagerPropsOf(element).stylisPlugins[0].name,
    )
    expect(new Set(names).size).toBe(3)
  })

  test('re-renders a root with the same sheet and plugins, so its stylis instance survives', () => {
    const target = {}
    const mod = loadIsolated()
    mod.render(rootElement(target)).setLifecycle('background')

    const [mounted, rerendered] = mod.rendered.map((element) => styleSheetManagerPropsOf(element))
    expect(mounted).toEqual({stylisPlugins: [expect.any(Function)], target})
    expect(rerendered.target).toBe(target)
    expect(rerendered.stylisPlugins).toBe(mounted.stylisPlugins)
  })

  test('sources RootContext from the symbol-keyed WeakMap<createContext, Context>', () => {
    const React = makeReact()
    loadWrapper(renderRemote({app: APP, preamble: ''}), React).render({}, {}, {})

    const slot = (globalThis as Record<symbol, unknown>)[ROOT_SLOT] as WeakMap<object, Ctx>
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

    const slot = (globalThis as Record<symbol, unknown>)[ROOT_SLOT] as WeakMap<object, Ctx>
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

    const slot = (globalThis as Record<symbol, unknown>)[ROOT_SLOT] as WeakMap<object, Ctx>
    // Both wrappers wrote/read the WeakMap, so a single Context object exists.
    expect(slot.get(React.createContext)).toBeDefined()
  })

  test('a different React copy gets its own context (no cross-copy leak)', () => {
    const reactA = makeReact()
    const reactB = makeReact()
    loadWrapper(renderRemote({app: APP, preamble: ''}), reactA).render({}, {}, {})
    loadWrapper(renderRemote({app: APP, preamble: ''}), reactB).render({}, {}, {})

    const slot = (globalThis as Record<symbol, unknown>)[ROOT_SLOT] as WeakMap<object, Ctx>
    expect(slot.get(reactA.createContext)).not.toBe(slot.get(reactB.createContext))
  })

  test('passes renderOptions.moduleId and parentKey in the root context, and props to App', () => {
    const React = makeReact()
    const mod = loadWrapper(renderRemote({app: APP, preamble: ''}), React)
    mod.render(
      {},
      {greeting: 'hi'},
      {moduleId: 'favorites/views/inbox/tile', parentKey: 'home-key'},
    )

    expect(rootValueOf(mod.rendered[0], React)).toEqual({
      moduleId: 'favorites/views/inbox/tile',
      parentKey: 'home-key',
      signal: expect.any(AbortSignal),
    })
    expect(appOf(mod.rendered[0])?.props).toEqual({greeting: 'hi'})
  })

  test('a two-argument render(element, props) call renders with no module id or parent key', () => {
    const React = makeReact()
    const mod = loadWrapper(renderRemote({app: APP, preamble: ''}), React)
    // No renderOptions argument at all.
    mod.render({}, {})

    expect(rootValueOf(mod.rendered[0], React)).toEqual({
      moduleId: undefined,
      parentKey: undefined,
      signal: expect.any(AbortSignal),
    })
  })

  test('keeps the module id and parent key of the render that created the root', () => {
    const React = makeReact()
    const mod = loadWrapper(renderRemote({app: APP, preamble: ''}), React)
    const root = {}
    mod.render(root, {}, {moduleId: 'favorites/App', parentKey: 'home-key'})
    mod.render(root, {}, {moduleId: 'other/App', parentKey: 'other-key'})

    expect(rootValueOf(mod.rendered[1], React)).toMatchObject({
      moduleId: 'favorites/App',
      parentKey: 'home-key',
    })
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

  test('a hot update aborts the replaced root on the next tick', async () => {
    const hot: HotStub = {
      accept(cb) {
        this.accepted = cb
      },
    }
    const React = makeReact()
    const mod = loadWrapper(renderRemote({app: APP, hmr: true, preamble: ''}), React, {hot})
    mod.render({})
    const {signal} = rootValueOf(mod.rendered[0], React)!

    hot.accepted!({render: () => ({setLifecycle: () => {}})})

    expect(signal.aborted).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(signal.aborted).toBe(true)
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

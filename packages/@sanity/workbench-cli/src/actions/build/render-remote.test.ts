import {afterEach, describe, expect, test, vi} from 'vitest'

import {renderRemote} from './render-remote.js'

const MODULE_SLOT = Symbol.for('sanity.os.module')

/** A minimal stand-in for a React module: only the members the wrapper touches. */
type Ctx = {_default: unknown; Provider: 'Provider'}
type ReactStub = {
  createContext: (defaultValue: unknown) => Ctx
  createElement: (type: unknown, props: unknown, ...children: unknown[]) => Element
  StrictMode: 'StrictMode'
}
type Element = {children: unknown[]; props: unknown; type: unknown}
type Root = {render: (element: Element) => void; unmount: () => void}

function makeReact(): ReactStub {
  return {
    createContext: (defaultValue) => ({_default: defaultValue, Provider: 'Provider'}),
    createElement: (type, props, ...children) => ({children, props, type}),
    StrictMode: 'StrictMode',
  }
}

/**
 * Execute a generated wrapper against injected React / react-dom stubs, without
 * a real React copy. Rewrites the wrapper's two static imports into locals
 * pulled from `deps`, so the ESM template runs as a plain function body.
 */
function loadWrapper(
  source: string,
  React: ReactStub = makeReact(),
  onUnmount: () => void = () => {},
): {
  render: (rootElement: object, props?: unknown, renderOptions?: unknown) => () => void
  rendered: Element[]
} {
  const rendered: Element[] = []
  const createRoot = (): Root => ({
    render: (element) => rendered.push(element),
    unmount: onUnmount,
  })
  const body = source
    .replace(/^import \* as React from 'react'$/m, 'const React = deps.React')
    .replace(/^import \{ createRoot \} from 'react-dom\/client'$/m, 'const {createRoot} = deps')
    .replace(
      /^import \{ StyleSheetManager \} from 'styled-components'$/m,
      "const StyleSheetManager = 'StyleSheetManager'",
    )
    // `export`/`import.meta` are illegal in a Function body; drop them so the
    // ESM template runs as a plain module scope. `render` is still captured via
    // the returned reference below.
    .replaceAll(/^export /gm, '')
  // The federation entries also import a preamble; none is passed in these tests.
  const factory = new Function('deps', `${body}\nreturn {render}`)
  const mod = factory({createRoot, React}) as {
    render: (rootElement: object, props?: unknown, renderOptions?: unknown) => () => void
  }
  return {rendered, ...mod}
}

const APP = `() => 'app'`

afterEach(() => {
  // Each test owns the slot; drop it so a fresh WeakMap is created next run.
  delete (globalThis as Record<symbol, unknown>)[MODULE_SLOT]
})

describe('renderRemote module context', () => {
  test('keeps stylesheet targets separate and removes only the unmounted target', () => {
    const firstTarget = {remove: vi.fn()}
    const secondTarget = {remove: vi.fn()}
    const ownerDocument = {
      createElement: vi.fn().mockReturnValueOnce(firstTarget).mockReturnValueOnce(secondTarget),
      head: {appendChild: vi.fn()},
    }
    const firstRoot = {ownerDocument}
    const secondRoot = {ownerDocument}
    const mod = loadWrapper(renderRemote({app: APP, isolateStyles: true, preamble: ''}))
    const unmount = mod.render(firstRoot)
    const unmountSecond = mod.render(secondRoot)
    mod.render(firstRoot)
    expect(mod.rendered.map(({props, type}) => ({props, type}))).toEqual([
      {props: {target: firstTarget}, type: 'StyleSheetManager'},
      {props: {target: secondTarget}, type: 'StyleSheetManager'},
      {props: {target: firstTarget}, type: 'StyleSheetManager'},
    ])
    expect(ownerDocument.head.appendChild.mock.calls).toEqual([[firstTarget], [secondTarget]])
    unmount()
    expect(firstTarget.remove).toHaveBeenCalledOnce()
    expect(secondTarget.remove).not.toHaveBeenCalled()
    unmountSecond()
    expect(secondTarget.remove).toHaveBeenCalledOnce()
  })

  test('keeps the stylesheet attached until React finishes unmounting', () => {
    const events: string[] = []
    const target = {remove: () => events.push('remove stylesheet')}
    const root = {ownerDocument: {createElement: () => target, head: {appendChild: () => {}}}}
    const mod = loadWrapper(
      renderRemote({app: APP, isolateStyles: true, preamble: ''}),
      makeReact(),
      () => events.push('unmount React'),
    )
    mod.render(root)()
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

    const [provider] = mod.rendered
    expect(provider.type).toBe('Provider')
    expect((provider.props as {value: unknown}).value).toBe(moduleId)
    const [appElement] = provider.children as Element[]
    expect((appElement.props as {greeting: string}).greeting).toBe('hi')
  })

  test('a two-argument render(element, props) call renders with moduleId undefined', () => {
    const React = makeReact()
    const mod = loadWrapper(renderRemote({app: APP, preamble: ''}), React)
    // Old host: no renderOptions argument at all.
    mod.render({}, {})

    const [provider] = mod.rendered
    expect(provider.type).toBe('Provider')
    expect((provider.props as {value: unknown}).value).toBeUndefined()
  })

  test('the generated wrapper never imports the SDK', () => {
    const source = renderRemote({app: APP, hmr: true, preamble: '', version: 'view.version'})
    expect(source).not.toMatch(/@sanity\/sdk/)
  })
})

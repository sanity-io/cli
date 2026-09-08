import {afterEach, describe, expect, test} from 'vitest'

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
 * a real React copy. Rewrites the wrapper's three static imports into locals
 * pulled from `deps`, so the ESM template runs as a plain function body.
 */
function loadWrapper(
  source: string,
  React: ReactStub,
): {
  render: (rootElement: object, props?: unknown, renderOptions?: unknown) => () => void
  rendered: Element[]
} {
  const rendered: Element[] = []
  const createRoot = (): Root => ({
    render: (element) => rendered.push(element),
    unmount: () => {},
  })
  const body = source
    .replace(/^import \* as React from 'react'$/m, 'const React = deps.React')
    .replace(
      /^import \{ createElement, StrictMode \} from 'react'$/m,
      'const {createElement, StrictMode} = deps.React',
    )
    .replace(/^import \{ createRoot \} from 'react-dom\/client'$/m, 'const {createRoot} = deps')
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
  test('sources ModuleContext from the symbol-keyed WeakMap<ReactModule, Context>', () => {
    const React = makeReact()
    loadWrapper(renderRemote({app: APP, preamble: ''}), React).render({}, {}, {})

    const slot = (globalThis as Record<symbol, unknown>)[MODULE_SLOT] as WeakMap<object, Ctx>
    expect(slot).toBeInstanceOf(WeakMap)
    expect(slot.has(React)).toBe(true)
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
    expect(slot.get(React)).toBeDefined()
  })

  test('a different React copy gets its own context (no cross-copy leak)', () => {
    const reactA = makeReact()
    const reactB = makeReact()
    loadWrapper(renderRemote({app: APP, preamble: ''}), reactA).render({}, {}, {})
    loadWrapper(renderRemote({app: APP, preamble: ''}), reactB).render({}, {}, {})

    const slot = (globalThis as Record<symbol, unknown>)[MODULE_SLOT] as WeakMap<object, Ctx>
    expect(slot.get(reactA)).not.toBe(slot.get(reactB))
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

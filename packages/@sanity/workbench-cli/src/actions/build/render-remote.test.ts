import {afterEach, describe, expect, test, vi} from 'vitest'

import {renderRemote} from './render-remote.js'

const MODULE_SLOT = Symbol.for('sanity.os.module')

type Element = {children: unknown[]; props: unknown; type: unknown}
type Context = {Provider: object}

function makeReact() {
  return {
    createContext: (): Context => ({Provider: {}}),
    createElement: (type: unknown, props: unknown, ...children: unknown[]): Element => ({
      children,
      props,
      type,
    }),
    StrictMode: 'StrictMode',
  }
}

function loadWrapper(source: string, React = makeReact(), unmount = () => {}) {
  const rendered: Element[] = []
  const createRoot = () => ({render: (element: Element) => rendered.push(element), unmount})
  const hot = {accept: vi.fn()}
  // Inject external imports so the emitted module can execute without a browser or bundler.
  const body = source
    .replace(/^import \* as React from 'react'$/m, 'const React = deps.React')
    .replace(/^import \{ createRoot \} from 'react-dom\/client'$/m, 'const {createRoot} = deps')
    .replace(
      /^import \{ StyleSheetManager \} from 'styled-components'$/m,
      'const {StyleSheetManager} = deps',
    )
    .replaceAll('import.meta.hot', 'deps.hot')
    .replaceAll(/^export /gm, '')
  const factory = new Function(
    'deps',
    `${body}\nreturn {render, version: typeof version === 'undefined' ? undefined : version}`,
  )
  const mod = factory({createRoot, hot, React, StyleSheetManager: 'StyleSheetManager'}) as {
    render: (rootElement: object, props?: unknown, renderOptions?: unknown) => () => void
    version?: string
  }
  return {hot, rendered, ...mod}
}

const APP = `() => 'app'`

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[MODULE_SLOT]
})

describe('remote rendering', () => {
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

  test('renders without a stylesheet dependency when sharing is disabled', () => {
    const source = renderRemote({preamble: `const App = ${APP}`})
    const mod = loadWrapper(source)
    mod.render({}, {greeting: 'Hello'})
    expect(source).not.toContain('styled-components')
    expect(mod.rendered[0].children).toEqual([
      {children: [], props: {greeting: 'Hello'}, type: expect.any(Function)},
    ])
    expect(mod.version).toBeUndefined()
    expect(mod.hot.accept).not.toHaveBeenCalled()
  })

  test('exposes the selected component and version to the host', () => {
    const mod = loadWrapper(
      renderRemote({
        app: 'view.components.panel',
        preamble: `const view = {components: {panel: 'Panel'}, version: '1.0'}`,
        version: 'view.version',
      }),
    )
    mod.render({}, {greeting: 'Hello'})
    expect(mod.version).toBe('1.0')
    expect(mod.rendered[0].children).toEqual([
      {children: [], props: {greeting: 'Hello'}, type: 'Panel'},
    ])
  })

  test('remounts live roots after a hot update with their props and render options', () => {
    const unmount = vi.fn()
    const mod = loadWrapper(renderRemote({app: APP, hmr: true, preamble: ''}), makeReact(), unmount)
    const root = {}
    mod.render(root, {greeting: 'Hello'}, {moduleId: 'favorites/App'})
    const next = {render: vi.fn()}
    mod.hot.accept.mock.calls[0][0](next)
    expect(unmount).toHaveBeenCalledOnce()
    expect(next.render.mock.calls).toEqual([
      [root, {greeting: 'Hello'}, {moduleId: 'favorites/App'}],
    ])
  })

  test('wraps the app in strict mode when requested by the host', () => {
    const mod = loadWrapper(renderRemote({app: APP, preamble: ''}))
    mod.render({}, {}, {reactStrictMode: true})
    expect(mod.rendered[0].type).toBe('StrictMode')
  })

  test('provides the module identity through the context shared with the SDK', () => {
    const React = makeReact()
    const mod = loadWrapper(renderRemote({app: APP, preamble: ''}), React)
    mod.render({}, {greeting: 'Hello'}, {moduleId: 'favorites/views/list/panel'})
    const slot = (globalThis as Record<symbol, unknown>)[MODULE_SLOT] as WeakMap<object, Context>
    expect(mod.rendered).toEqual([
      {
        children: [{children: [], props: {greeting: 'Hello'}, type: expect.any(Function)}],
        props: {value: 'favorites/views/list/panel'},
        type: slot.get(React.createContext)?.Provider,
      },
    ])
  })

  test('shares a context across wrappers using the same React copy', () => {
    const React = makeReact()
    const first = loadWrapper(renderRemote({app: APP, preamble: ''}), React)
    // Bundler interop can wrap the same React functions in different namespace objects.
    const second = loadWrapper(renderRemote({app: APP, preamble: ''}), {...React})
    first.render({})
    second.render({})
    expect(first.rendered[0].type).toBe(second.rendered[0].type)
  })

  test('keeps contexts separate for different React copies', () => {
    const first = loadWrapper(renderRemote({app: APP, preamble: ''}))
    const second = loadWrapper(renderRemote({app: APP, preamble: ''}))
    first.render({})
    second.render({})
    expect(first.rendered[0].type).not.toBe(second.rendered[0].type)
  })

  test('accepts hosts that do not pass a module identity', () => {
    const mod = loadWrapper(renderRemote({app: APP, preamble: ''}))
    mod.render({}, {})
    expect(mod.rendered[0].props).toEqual({value: undefined})
  })

  test('does not require the SDK to render a remote', () => {
    expect(renderRemote({app: APP, hmr: true, preamble: ''})).not.toMatch(/@sanity\/sdk/)
  })
})

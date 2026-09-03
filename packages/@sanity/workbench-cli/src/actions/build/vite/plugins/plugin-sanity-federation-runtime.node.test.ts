import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {type ResolvedConfig} from 'vite'
import {afterEach, expect, test} from 'vitest'

import {FEDERATION_FILE_NAME, RUNTIME_DIR} from '../constants.js'
import {sanityFederationRuntime} from './plugin-sanity-federation-runtime.js'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, {force: true, recursive: true})
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('sanity.os.module')]
})

/** Run the plugin's `configResolved` against a temp root and read back the entry it wrote. */
function emitEntry(options: Parameters<typeof sanityFederationRuntime>[0]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'federation-runtime-'))
  roots.push(root)
  const plugin = sanityFederationRuntime(options)
  const configResolved = plugin.configResolved as (config: ResolvedConfig) => void
  configResolved({root} as ResolvedConfig)
  return fs.readFileSync(path.join(root, RUNTIME_DIR, `${FEDERATION_FILE_NAME}.jsx`), 'utf8')
}

type Element = {children: unknown[]; props: Record<string, unknown>; type: unknown}

/**
 * Evaluate an emitted entry as a plain function body with its imports bound to
 * stubs. The entry's `app` expression is authored in this plugin as a string, so
 * a free identifier in it (e.g. a `createElement` the template no longer imports)
 * is only observable by running `render()` — nothing statically checks it.
 */
function evaluateEntry(source: string) {
  const rendered: Element[] = []
  const React = {
    createContext: () => ({Provider: 'Provider'}),
    createElement: (type: unknown, props: Record<string, unknown>, ...children: unknown[]) =>
      ({children, props, type}) satisfies Element,
    StrictMode: 'StrictMode',
  }
  const deps = {
    config: {projectId: 'abc123'},
    createRoot: () => ({render: (element: Element) => rendered.push(element), unmount: () => {}}),
    React,
    Studio: 'Studio',
  }
  const body = source
    .replace(/^import \* as React from 'react'$/m, 'const React = deps.React')
    .replace(/^import \{ createRoot \} from 'react-dom\/client'$/m, 'const {createRoot} = deps')
    .replace(/^import \{ Studio \} from 'sanity'$/m, 'const {Studio} = deps')
    .replace(/^import config from .*$/m, 'const config = deps.config')
    .replaceAll(/^export /gm, '')
    .replaceAll('import.meta.hot', 'undefined')
  const mod = new Function('deps', `${body}\nreturn {render}`)(deps) as {
    render: (rootElement: object, props?: unknown, renderOptions?: unknown) => () => void
  }
  return {rendered, ...mod}
}

test('the studio entry renders Studio with the config and forwarded props', () => {
  const source = emitEntry({isApp: false, studioConfigPath: '/studio/sanity.config.ts'})
  const mod = evaluateEntry(source)

  // Regression: the studio `app` expression once called a bare `createElement`
  // after the template switched to `import * as React`; it threw here.
  mod.render({}, {scheme: 'dark'}, {moduleId: 'studio/App'})

  const [provider] = mod.rendered
  expect(provider.props.value).toBe('studio/App')
  const [app] = provider.children as Element[]
  expect(app.props).toEqual({scheme: 'dark'})
  // Render the bound App the way React would to reach the studio expression.
  const studio = (app.type as (props: unknown) => Element)(app.props)
  expect(studio.type).toBe('Studio')
  expect(studio.props).toEqual({config: {projectId: 'abc123'}, scheme: 'dark'})
})

test('the app entry renders the imported App with forwarded props', () => {
  const source = emitEntry({appEntry: '/app/src/App.tsx', isApp: true})
  const mod = evaluateEntry(source.replace(/^import App from .*$/m, 'const App = () => "app"'))

  mod.render({}, {greeting: 'hi'})

  const [provider] = mod.rendered
  const [app] = provider.children as Element[]
  expect(app.props).toEqual({greeting: 'hi'})
})

test('an SDK app entry renders through the lifecycle harness', () => {
  const entry = emitEntry({appEntry: '/app/src/App.tsx', isApp: true})

  expect(entry).toContain('dispose.setLifecycle')
  expect(entry).toContain(`import App from "/app/src/App.tsx"`)
})

test('a studio entry renders through the lifecycle harness', () => {
  const entry = emitEntry({isApp: false, studioConfigPath: '/studio/sanity.config.ts'})

  expect(entry).toContain('dispose.setLifecycle')
  expect(entry).toContain('import.meta.hot')
})

test('a headless app exposes no `./App`, so it carries no controller', () => {
  const entry = emitEntry({isApp: true})

  expect(entry).not.toContain('setLifecycle')
  expect(entry).toContain('This application has no app view')
})

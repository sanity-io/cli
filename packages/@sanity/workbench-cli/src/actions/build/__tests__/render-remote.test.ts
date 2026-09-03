// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

import {act, createElement, useEffect, useState} from 'react'
import {afterAll, beforeAll, beforeEach, expect, test} from 'vitest'

import {renderRemote} from '../render-remote.js'

/**
 * The render contract is a generated *module*, so the only honest way to test it
 * is to run it: write the generated source out and import it. The temp dir sits
 * inside the package so the module's bare `react` / `react-dom/client` imports
 * resolve the same way they do in a real remote.
 */
const TMP_DIR = path.join(import.meta.dirname, 'tmp')

/** A React whose namespace has no `Activity` — i.e. anything before 19.2. */
const REACT_WITHOUT_ACTIVITY = `export {createElement, StrictMode} from 'react'\n`

interface RenderController {
  (): void
  dispose(): void
  setLifecycle(lifecycle: 'background' | 'foreground'): void
}

interface Harness {
  render(
    rootElement: Element,
    props?: unknown,
    renderOptions?: {reactStrictMode?: boolean},
  ): RenderController
}

let moduleCount = 0

async function loadHarness({react = 'react'}: {react?: string} = {}): Promise<Harness> {
  const source = renderRemote({
    app: 'globalThis.__RENDER_REMOTE_PROBE__',
    preamble: '',
  }).replace("from 'react'", `from ${JSON.stringify(react)}`)

  const file = path.join(TMP_DIR, `harness-${moduleCount++}.js`)
  fs.writeFileSync(file, source)
  return (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Harness
}

let effectMounts = 0
let effectCleanups = 0
let setCount: (count: number) => void

function Probe() {
  const [count, setCountState] = useState(0)
  setCount = setCountState
  useEffect(() => {
    effectMounts++
    return () => {
      effectCleanups++
    }
  }, [])
  return createElement('span', null, `probe:${count}`)
}

let container: HTMLDivElement

beforeAll(() => {
  ;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true
  ;(globalThis as {__RENDER_REMOTE_PROBE__?: unknown}).__RENDER_REMOTE_PROBE__ = Probe
  fs.mkdirSync(TMP_DIR, {recursive: true})
  fs.writeFileSync(path.join(TMP_DIR, 'react-without-activity.js'), REACT_WITHOUT_ACTIVITY)
})

afterAll(() => {
  fs.rmSync(TMP_DIR, {force: true, recursive: true})
})

beforeEach(() => {
  effectMounts = 0
  effectCleanups = 0
  container = document.createElement('div')
  document.body.append(container)
})

test('backgrounding pauses the user tree; foregrounding resumes it with its state', async () => {
  const {render} = await loadHarness()

  let controller!: RenderController
  act(() => {
    controller = render(container)
  })
  expect(effectMounts).toBe(1)
  expect(container.textContent).toBe('probe:0')

  act(() => setCount(5))
  expect(container.textContent).toBe('probe:5')

  // Hidden: React tears the user tree's effects down, keeping its state.
  act(() => controller.setLifecycle('background'))
  expect(effectCleanups).toBe(1)
  expect(effectMounts).toBe(1)

  act(() => controller.setLifecycle('foreground'))
  expect(effectMounts).toBe(2)
  expect(container.textContent).toBe('probe:5')

  act(() => controller.dispose())
  expect(effectCleanups).toBe(2)
  expect(container.textContent).toBe('')
})

test('the return value is the disposer itself, for hosts predating the controller', async () => {
  const {render} = await loadHarness()

  let dispose!: RenderController
  act(() => {
    dispose = render(container)
  })

  expect(typeof dispose).toBe('function')
  expect(dispose.dispose).toBe(dispose)

  act(() => dispose())
  expect(effectCleanups).toBe(1)
  expect(container.textContent).toBe('')
})

test('disposing detaches `setLifecycle`, so a late call is inert', async () => {
  const {render} = await loadHarness()

  let controller!: RenderController
  act(() => {
    controller = render(container)
  })
  act(() => controller.dispose())

  act(() => controller.setLifecycle('background'))
  expect(container.textContent).toBe('')
  expect(effectMounts).toBe(1)
})

test('a React without `Activity` still renders, and `setLifecycle` is a no-op', async () => {
  const {render} = await loadHarness({react: './react-without-activity.js'})

  let controller!: RenderController
  act(() => {
    controller = render(container)
  })
  expect(container.textContent).toBe('probe:0')

  act(() => controller.setLifecycle('background'))
  expect(effectCleanups).toBe(0)
  expect(container.textContent).toBe('probe:0')

  act(() => controller.dispose())
  expect(container.textContent).toBe('')
})

test('hot updates carry the lifecycle over to the new module', () => {
  const source = renderRemote({app: 'App', hmr: true, preamble: ''})

  expect(source).toContain(
    'next.render(rootElement, args.props, args.renderOptions).setLifecycle(args.lifecycle)',
  )
})

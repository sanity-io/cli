// @vitest-environment jsdom
import {mkdir, realpath, rm, symlink, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

import {afterAll, beforeAll, expect, test} from 'vitest'

import {renderRemote} from '../../../../src/actions/build/render-remote.js'

// The package doesn't depend on styled-components, so this borrows the fixture's copy.
const fixture = path.resolve(import.meta.dirname, '../../../../../../../fixtures/federated-studio')
// Inside the package: the jsdom environment can't import modules from outside it.
const TMP_DIR = path.join(import.meta.dirname, 'tmp')

beforeAll(async () => {
  ;(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true
  await mkdir(path.join(TMP_DIR, 'node_modules'), {recursive: true})
  for (const dependency of ['react', 'react-dom', 'styled-components']) {
    await symlink(
      await realpath(path.join(fixture, 'node_modules', dependency)),
      path.join(TMP_DIR, 'node_modules', dependency),
      'junction',
    )
  }
  await writeFile(
    path.join(TMP_DIR, 'harness.js'),
    renderRemote({app: 'globalThis.__ISLAND__', isolateStyles: true, preamble: ''}),
  )
  // Sits beside the harness, so the test gets the same React and styled-components copies.
  await writeFile(
    path.join(TMP_DIR, 'deps.js'),
    `export {act, createElement} from 'react'
export {createRoot} from 'react-dom/client'
export {styled} from 'styled-components'`,
  )
})

afterAll(() => rm(TMP_DIR, {force: true, recursive: true}))

const load = (file: string) =>
  import(/* @vite-ignore */ pathToFileURL(path.join(TMP_DIR, file)).href)

// React 19 would otherwise swallow an island's render error and leave it empty.
const rethrow = (error: unknown) => {
  throw error
}

test("an island mounted later keeps the host's overrides of a component they share", async () => {
  const {act, createElement, createRoot, styled} = await load('deps.js')
  const Base = styled.span`
    position: relative;
  `
  const Override = styled(Base)`
    position: absolute;
  `
  ;(globalThis as {__ISLAND__?: unknown}).__ISLAND__ = Base
  const {render} = await load('harness.js')
  const host = document.createElement('div')
  const island = document.createElement('div')
  document.body.append(host, island)

  act(() => {
    createRoot(host).render(createElement(Override))
    render(island, {}, {rootOptions: {onUncaughtError: rethrow}})
  })

  expect(island.firstElementChild).not.toBeNull()
  expect(getComputedStyle(host.firstElementChild!).position).toBe('absolute')
})

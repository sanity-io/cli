import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {type Plugin} from 'vite'
import {afterEach, describe, expect, test} from 'vitest'

import {stubUi5Stylesheet} from '../plugin-stub-ui5-stylesheet.js'

const createdDirs: string[] = []

/**
 * A minimal on-disk app with `sanity` depending on a `ui5` package, so the
 * pnpm-layout branch (resolve the ui5 package dir, prefix-match file paths)
 * exercises real resolution.
 */
function appWithUi5(): {appRoot: string; ui5Dir: string} {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-ui5-'))
  createdDirs.push(appRoot)
  const sanityDir = path.join(appRoot, 'node_modules', 'sanity')
  const ui5Dir = path.join(appRoot, 'node_modules', 'ui5')
  fs.mkdirSync(sanityDir, {recursive: true})
  fs.mkdirSync(ui5Dir, {recursive: true})
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({name: 'app'}))
  fs.writeFileSync(
    path.join(sanityDir, 'package.json'),
    JSON.stringify({main: './index.js', name: 'sanity', version: '6.99.0'}),
  )
  fs.writeFileSync(path.join(sanityDir, 'index.js'), '')
  fs.writeFileSync(
    path.join(ui5Dir, 'package.json'),
    JSON.stringify({main: './index.js', name: 'ui5', version: '1.0.0'}),
  )
  fs.writeFileSync(path.join(ui5Dir, 'index.js'), '')
  fs.writeFileSync(path.join(ui5Dir, 'styles.css'), 'body { padding: 0 }')
  return {appRoot, ui5Dir}
}

function hooks(appRoot: string): {
  load: (id: string) => unknown
  resolveId: (source: string) => unknown
} {
  const plugin = stubUi5Stylesheet(appRoot) as Plugin
  const resolveId = plugin.resolveId
  const load = plugin.load
  const resolveIdHook = typeof resolveId === 'function' ? resolveId : resolveId?.handler
  const loadHook = typeof load === 'function' ? load : load?.handler
  return {
    load: (id) => (loadHook as (id: string) => unknown).call(undefined as never, id),
    resolveId: (source) =>
      (resolveIdHook as (source: string) => unknown).call(undefined as never, source),
  }
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, {force: true, recursive: true})
  }
})

describe('stubUi5Stylesheet', () => {
  test('stubs the bare specifier (build pipeline)', () => {
    const {appRoot} = appWithUi5()
    const {load, resolveId} = hooks(appRoot)
    const stubId = resolveId('ui5/styles.css')
    expect(stubId).toBeTypeOf('string')
    expect(load(stubId as string)).toBe('')
  })

  test('stubs the resolved /@fs/ path (pnpm dev-server layout)', () => {
    const {appRoot, ui5Dir} = appWithUi5()
    const {resolveId} = hooks(appRoot)
    expect(resolveId(`/@fs${ui5Dir}/styles.css`)).toBeTypeOf('string')
    expect(resolveId(`/@fs${ui5Dir}/styles.css?direct`)).toBeTypeOf('string')
  })

  test('stubs an /ui5/ path segment (npm/yarn layouts) even without a resolvable ui5', () => {
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stub-ui5-'))
    createdDirs.push(appRoot)
    fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({name: 'app'}))
    const {resolveId} = hooks(appRoot)
    expect(resolveId('/x/node_modules/ui5/styles.css')).toBeTypeOf('string')
    expect(resolveId('/x/node_modules/ui5/dist/styles.css')).toBeTypeOf('string')
  })

  test('leaves every other stylesheet and module alone', () => {
    const {appRoot} = appWithUi5()
    const {load, resolveId} = hooks(appRoot)
    expect(resolveId('/x/node_modules/@sanity/ui/styles.css')).toBeNull()
    expect(resolveId('ui5/styles')).toBeNull()
    expect(resolveId('/x/src/App.tsx')).toBeNull()
    expect(load('/x/src/App.tsx')).toBeNull()
  })

  test('applies before other resolvers', () => {
    const {appRoot} = appWithUi5()
    expect((stubUi5Stylesheet(appRoot) as Plugin).enforce).toBe('pre')
  })
})

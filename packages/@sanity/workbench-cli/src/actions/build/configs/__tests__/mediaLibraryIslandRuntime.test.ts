import fs from 'node:fs'
import Module from 'node:module'
import os from 'node:os'
import path from 'node:path'

import {afterEach, describe, expect, onTestFinished, test, vi} from 'vitest'

import {
  hasMediaLibraryIslandRuntime,
  MEDIA_LIBRARY_ISLAND_RUNTIME_MODULE,
} from '../mediaLibraryIslandRuntime.js'

const createdDirs: string[] = []

/**
 * A minimal on-disk app whose node_modules carries a fake `sanity` package —
 * with or without the island runtime entry — so the probe exercises real
 * Node export-map resolution rather than a mock.
 */
function appWithSanity(options: {islandRuntimeEntry: boolean}): string {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'island-runtime-probe-'))
  createdDirs.push(appRoot)
  const sanityDir = path.join(appRoot, 'node_modules', 'sanity')
  fs.mkdirSync(path.join(sanityDir, 'lib'), {recursive: true})
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({name: 'app'}))
  fs.writeFileSync(
    path.join(sanityDir, 'package.json'),
    JSON.stringify({
      exports: {
        '.': './lib/index.js',
        ...(options.islandRuntimeEntry
          ? {'./media-library-island-runtime': './lib/media-library-island-runtime.js'}
          : {}),
      },
      name: 'sanity',
      type: 'module',
      version: '6.99.0',
    }),
  )
  fs.writeFileSync(path.join(sanityDir, 'lib', 'index.js'), 'export {}\n')
  if (options.islandRuntimeEntry) {
    fs.writeFileSync(
      path.join(sanityDir, 'lib', 'media-library-island-runtime.js'),
      'export function mountIsland() {}\n',
    )
  }
  return appRoot
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, {force: true, recursive: true})
  }
})

describe('hasMediaLibraryIslandRuntime', () => {
  test('resolves the entry from the app root', () => {
    expect(hasMediaLibraryIslandRuntime(appWithSanity({islandRuntimeEntry: true}))).toBe(true)
  })

  test('is false when the installed sanity predates the entry', () => {
    expect(hasMediaLibraryIslandRuntime(appWithSanity({islandRuntimeEntry: false}))).toBe(false)
  })

  test('is false when sanity is not installed at all', () => {
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'island-runtime-probe-'))
    createdDirs.push(appRoot)
    fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({name: 'app'}))
    expect(hasMediaLibraryIslandRuntime(appRoot)).toBe(false)
  })

  test('is false when sanity is reachable only through NODE_PATH', () => {
    // Node reads NODE_PATH once at startup; `_initPaths` re-reads it.
    const {_initPaths: initPaths} = Module as unknown as {_initPaths: () => void}
    onTestFinished(() => {
      vi.unstubAllEnvs()
      initPaths()
    })
    vi.stubEnv('NODE_PATH', path.join(appWithSanity({islandRuntimeEntry: true}), 'node_modules'))
    initPaths()

    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'island-runtime-probe-'))
    createdDirs.push(appRoot)
    fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({name: 'app'}))
    expect(hasMediaLibraryIslandRuntime(appRoot)).toBe(false)
  })

  test('module id matches what the generated expose imports', () => {
    expect(MEDIA_LIBRARY_ISLAND_RUNTIME_MODULE).toBe('sanity/media-library-island-runtime')
  })
})

import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {createAutoUpdatesLoader} from '../autoUpdatesLoader.js'

const KEY = Symbol.for('sanity.autoUpdates')
const NOW = 1_800_000_000
// An app ID shaped like a timestamp segment must survive the timestamp refresh.
const APP_ID = 't9'
const SANITY_URL = `https://sanity-cdn.com/v1/modules/by-app/${APP_ID}/t100/%5E6.17.0/sanity`
const CURRENT_SANITY_URL = SANITY_URL.replace('/t100', `/t${NOW}`)
const bundled = {source: 'bundled'}
const vendor = {react: async () => ({})}
const modules = {sanity: {source: 'cdn'}, 'sanity/structure': {source: 'cdn structure'}}
const load = vi.fn(async (_appId: string, _request: object) => ({modules}))

function setup() {
  const loader = createAutoUpdatesLoader({
    appId: APP_ID,
    cssUrls: [`${SANITY_URL}/index.css`],
    imports: {sanity: SANITY_URL, 'sanity/': `${SANITY_URL}/`},
    specifiers: ['sanity', 'sanity/structure'],
    vendor,
  })

  return {
    importMapUrl: loader.importMapUrl,
    load: (specifier: string) => loader.load(specifier, async () => bundled),
  }
}

beforeEach(() => {
  vi.useFakeTimers({now: NOW * 1000, toFake: ['Date']})
  Object.assign(globalThis, {[KEY]: {versions: {1: load}}})
})

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[KEY]
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

test('loads the auto-updated packages through Workbench, from current module server URLs', async () => {
  const {importMapUrl, load: loadModule} = setup()

  const [sanity, structure] = await Promise.all([
    loadModule('sanity'),
    loadModule('sanity/structure'),
  ])

  expect(sanity).toBe(modules.sanity)
  expect(structure).toBe(modules['sanity/structure'])

  expect(load).toHaveBeenCalledExactlyOnceWith(APP_ID, {
    imports: {sanity: CURRENT_SANITY_URL, 'sanity/': `${CURRENT_SANITY_URL}/`},
    specifiers: ['sanity', 'sanity/structure'],
    styles: [`${CURRENT_SANITY_URL}/index.css`],
    vendor,
  })
  expect(importMapUrl('sanity')).toBe(CURRENT_SANITY_URL)
})

test.each([
  {autoUpdates: undefined, when: 'no Workbench runs the app'},
  {autoUpdates: {versions: {}}, when: 'Workbench offers no contract version 1'},
  {
    autoUpdates: {versions: {1: async () => undefined}},
    when: "Workbench doesn't run the app as auto-updating",
  },
])('uses the bundled copy of every package when $when', async ({autoUpdates}) => {
  Object.assign(globalThis, {[KEY]: autoUpdates})
  const {importMapUrl, load: loadModule} = setup()

  await expect(loadModule('sanity')).resolves.toBe(bundled)
  await expect(loadModule('sanity/structure')).resolves.toBe(bundled)
  expect(importMapUrl('sanity')).toBeUndefined()
})

test('fails every package when Workbench fails to load them', async () => {
  const error = new TypeError('Failed to fetch')
  const failing = vi.fn(() => Promise.reject(error))
  Object.assign(globalThis, {[KEY]: {versions: {1: failing}}})
  const {importMapUrl, load: loadModule} = setup()

  await expect(loadModule('sanity')).rejects.toBe(error)
  await expect(loadModule('sanity/structure')).rejects.toBe(error)
  expect(importMapUrl('sanity')).toBeUndefined()
  expect(failing).toHaveBeenCalledOnce()
})

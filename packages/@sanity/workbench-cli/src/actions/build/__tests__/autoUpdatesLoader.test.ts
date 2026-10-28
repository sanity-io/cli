import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {createAutoUpdatesLoader} from '../autoUpdatesLoader.js'

const KEY = Symbol.for('sanity.autoUpdates')
const NOW = 1_800_000_000
// An app ID shaped like a timestamp segment must survive the timestamp refresh.
const APP_ID = 't9'
const SANITY_URL = `https://sanity-cdn.com/v1/modules/by-app/${APP_ID}/t100/%5E6.17.0/sanity`
const CURRENT_SANITY_URL = SANITY_URL.replace('/t100', `/t${NOW}`)
const vendor = {react: async () => ({})}
const modules = {sanity: {source: 'cdn'}, 'sanity/structure': {source: 'cdn structure'}}
const load = vi.fn(async (_appId: string, _request: object) => ({modules}))

function setup() {
  return createAutoUpdatesLoader({
    appId: APP_ID,
    cssUrls: [`${SANITY_URL}/index.css`],
    imports: {sanity: SANITY_URL, 'sanity/': `${SANITY_URL}/`},
    specifiers: ['sanity', 'sanity/structure'],
    vendor,
  })
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
  const {imports, load: loadModule} = setup()

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
  expect(imports.sanity).toBe(CURRENT_SANITY_URL)
})

test('refreshes the timestamp in default (not by-app) module server URLs', async () => {
  const url = 'https://sanity-cdn.com/v1/modules/sanity/default/%5E6.17.0/t100'
  const loader = createAutoUpdatesLoader({
    appId: APP_ID,
    cssUrls: [],
    imports: {sanity: url},
    specifiers: ['sanity'],
    vendor,
  })

  await loader.load('sanity')

  expect(load).toHaveBeenCalledExactlyOnceWith(APP_ID, {
    imports: {sanity: url.replace('/t100', `/t${NOW}`)},
    specifiers: ['sanity'],
    styles: [],
    vendor,
  })
})

test.each([
  {autoUpdates: undefined, when: 'no Workbench runs the app'},
  {autoUpdates: {versions: {}}, when: 'Workbench offers no contract version 1'},
])('fails every package when $when', async ({autoUpdates}) => {
  Object.assign(globalThis, {[KEY]: autoUpdates})
  const {load: loadModule} = setup()

  await expect(loadModule('sanity')).rejects.toThrow(
    'The auto update loader is not installed in dashboard',
  )
  await expect(loadModule('sanity/structure')).rejects.toThrow(
    'The auto update loader is not installed in dashboard',
  )
})

test('fails every package when Workbench fails to load them', async () => {
  const error = new TypeError('Failed to fetch')
  const failing = vi.fn(() => Promise.reject(error))
  Object.assign(globalThis, {[KEY]: {versions: {1: failing}}})
  const {load: loadModule} = setup()

  await expect(loadModule('sanity')).rejects.toBe(error)
  await expect(loadModule('sanity/structure')).rejects.toBe(error)
  expect(failing).toHaveBeenCalledOnce()
})

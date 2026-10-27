// @vitest-environment jsdom
import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {createAutoUpdatesLoader} from '../autoUpdatesLoader.js'

const KEY = Symbol.for('sanity.autoUpdates')
const NOW = 1_800_000_000
// The app ID's `t9` segment must survive the timestamp refresh.
const SANITY_URL = 'https://sanity-cdn.com/v1/modules/by-app/t9app/t100/%5E6.17.0/sanity'
const CURRENT_SANITY_URL = SANITY_URL.replace('/t100', `/t${NOW}`)
const bundled = {source: 'bundled'}
const vendor = {react: async () => ({})}
const importModule = vi.fn(async (specifier: string) => ({specifier}))
const load = vi.fn(async (_appId: string, _request: object) => importModule)

function setup() {
  const loader = createAutoUpdatesLoader({
    appId: 't9app',
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
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  document.head.replaceChildren()
  delete (globalThis as Record<symbol, unknown>)[KEY]
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

test('loads the auto-updated packages through Workbench, from current module CDN URLs', async () => {
  const {importMapUrl, load: loadModule} = setup()

  await expect(loadModule('sanity/structure')).resolves.toEqual({specifier: 'sanity/structure'})

  expect(load).toHaveBeenCalledWith('t9app', {
    imports: {sanity: CURRENT_SANITY_URL, 'sanity/': `${CURRENT_SANITY_URL}/`},
    vendor,
  })
  expect(importModule).toHaveBeenCalledWith('sanity')
  expect([...document.querySelectorAll('link')].map((link) => link.href)).toEqual([
    `${CURRENT_SANITY_URL}/index.css`,
  ])
  expect(importMapUrl('sanity')).toBe(CURRENT_SANITY_URL)
})

test('uses the bundled copy of every package when one fails to load', async () => {
  importModule
    .mockImplementationOnce(async (specifier) => ({specifier}))
    .mockRejectedValueOnce(new TypeError('Failed to fetch'))
  const {importMapUrl, load: loadModule} = setup()

  await expect(loadModule('sanity')).resolves.toBe(bundled)
  expect(importMapUrl('sanity')).toBeUndefined()
  expect(document.querySelectorAll('link')).toHaveLength(0)
})

test.each([
  {versions: undefined, when: 'Workbench offers no contract version 1'},
  {versions: {1: async () => undefined}, when: "Workbench didn't prepare the app"},
])('uses the bundled copy when $when', async ({versions}) => {
  Object.assign(globalThis, {[KEY]: versions && {versions}})

  await expect(setup().load('sanity')).resolves.toBe(bundled)
})

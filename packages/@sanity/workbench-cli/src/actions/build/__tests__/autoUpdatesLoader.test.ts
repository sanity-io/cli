// @vitest-environment jsdom
import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {createAutoUpdatesLoader} from '../autoUpdatesLoader.js'

type Instance = {
  source: (path: string, fetchOpts: RequestInit) => Promise<{source: string; url?: string}>
}

const HOST = Symbol.for('sanity.autoUpdates.host.v1')
const NOW = 1_800_000_000
// The app ID's `t9` segment must survive the timestamp refresh.
const SANITY_URL = 'https://sanity-cdn.com/v1/modules/by-app/t9app/t100/%5E6.17.0/sanity'
const CURRENT_SANITY_URL = SANITY_URL.replace('/t100', `/t${NOW}`)
const DIRECTORY = 'https://modules.sanity-cdn.com/modules/v1/sanity/6.20.0/bare/'
const react = {default: {}, useState() {}}
const bundled = {source: 'bundled'}
const importShim = Object.assign(vi.fn(), {addImportMap: vi.fn()})
const instances = new Map<string, Instance>()
const inInstance = (id: string, path = '') => `${location.origin}/~${id}/${path}`

function setup(appId = 't9app') {
  const loader = createAutoUpdatesLoader({
    appId,
    cssUrls: [`${SANITY_URL}/index.css`],
    imports: {sanity: SANITY_URL, 'sanity/': `${SANITY_URL}/`},
    specifiers: ['sanity', 'sanity/structure'],
    vendor: {react: async () => react},
  })

  return {
    importMapUrl: loader.importMapUrl,
    load: (specifier: string) => loader.load(specifier, async () => bundled),
  }
}

beforeEach(() => {
  vi.useFakeTimers({now: NOW * 1000, toFake: ['Date']})
  Object.assign(globalThis, {[HOST]: {instances, loadImportShim: async () => importShim}})
  importShim.mockImplementation(async (specifier: string) => ({specifier}))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  document.head.replaceChildren()
  delete (globalThis as Record<symbol, unknown>)[HOST]
  instances.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

test("loads the auto-updated packages as the app's own instance, from current module CDN URLs", async () => {
  const {importMapUrl, load} = setup()

  await expect(load('sanity/structure')).resolves.toEqual({specifier: 'sanity/structure'})

  const cdnPath = CURRENT_SANITY_URL.replace('https://', '')
  expect(importShim.addImportMap).toHaveBeenCalledWith({
    scopes: {
      [inInstance('i0')]: {
        react: inInstance('i0', 'vendor/react'),
        sanity: inInstance('i0', cdnPath),
        'sanity/': inInstance('i0', `${cdnPath}/`),
      },
    },
  })
  expect(importShim).toHaveBeenCalledWith('sanity', inInstance('i0'))
  expect([...document.querySelectorAll('link')].map((link) => link.href)).toEqual([
    `${CURRENT_SANITY_URL}/index.css`,
  ])
  expect(importMapUrl('sanity')).toBe(CURRENT_SANITY_URL)
})

test("serves the app's vendor modules as re-exports", async () => {
  await setup().load('sanity')

  const {source} = await instances.get('i0')!.source('vendor/react', {})

  expect(source).toContain('export default m.default')
  expect(source).toContain('export {e0 as "useState"}')
  expect(new Function(`${source.replaceAll(/^export .*$/gm, '')}\nreturn m`)()).toBe(react)
})

test('fetches module CDN code with the app ID of the app that loads it', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      text: async () =>
        'var a=e=>e??(typeof __SANITY_APP_ID__==`string`?__SANITY_APP_ID__:void 0),b=globalThis.__SANITY_APP_ID__',
      url: `${DIRECTORY}dist-B.mjs`,
    })),
  )
  await Promise.all([setup('app1').load('sanity'), setup('app2').load('sanity')])

  const loaded = await instances.get('i1')!.source('sanity-cdn.com/x', {})

  expect(fetch).toHaveBeenCalledWith('https://sanity-cdn.com/x', {})
  expect(loaded).toEqual({
    source: 'var a=e=>e??(typeof "app2"==`string`?"app2":void 0),b=globalThis.__SANITY_APP_ID__',
    type: 'js',
    url: inInstance('i1', `${DIRECTORY.replace('https://', '')}dist-B.mjs`),
  })
})

test('uses the bundled copy of every package when one fails to load', async () => {
  importShim.mockImplementation(async (specifier: string) => {
    if (specifier === 'sanity/structure') throw new TypeError('Failed to fetch')
    return {specifier}
  })
  const {importMapUrl, load} = setup()

  await expect(load('sanity')).resolves.toBe(bundled)
  expect(importMapUrl('sanity')).toBeUndefined()
  expect(document.querySelectorAll('link')).toHaveLength(0)
})

test('uses the bundled copy in a Workbench that does not load auto-updating apps', async () => {
  delete (globalThis as Record<symbol, unknown>)[HOST]

  await expect(setup().load('sanity')).resolves.toBe(bundled)
})

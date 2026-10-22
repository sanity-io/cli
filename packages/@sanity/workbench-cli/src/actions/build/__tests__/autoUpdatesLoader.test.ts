// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createAutoUpdatesLoader} from '../autoUpdatesLoader.js'

const SANITY_URL = 'https://sanity-cdn.com/v1/modules/by-app/app1/t100/%5E6.17.0/sanity'
const VISION_URL = 'https://sanity-cdn.com/v1/modules/by-app/app1/t100/%5E6.17.0/@sanity__vision'
const NOW = 1_800_000_000

const react = {createContext() {}}
const globals = globalThis as {__SANITY_APP_ID__?: string}
const bundled = {source: 'bundled'}

function setup({
  documentReact = react,
  importMapsApply = true,
  imports = {} as Record<string, unknown>,
} = {}) {
  const appIdAtImport = new Map<string, string | undefined>()
  const importModule = vi.fn(async (specifier: string) => {
    if (specifier === 'react') return documentReact
    if (specifier === 'sanity-auto-updates-import-map-probe' && importMapsApply) return {}
    appIdAtImport.set(specifier, globals.__SANITY_APP_ID__)
    if (specifier in imports) return imports[specifier] as Record<string, unknown>

    throw new TypeError(`Failed to resolve module specifier "${specifier}"`)
  })
  const loader = createAutoUpdatesLoader({
    appId: 'app1',
    importModule,
    packages: [
      {cssUrl: `${SANITY_URL}/index.css`, name: 'sanity', url: SANITY_URL},
      {name: '@sanity/vision', url: VISION_URL},
    ],
    react,
  })

  return {
    appIdAtImport,
    importModule,
    load: (specifier: string) => loader.load(specifier, async () => bundled),
    moduleUrl: loader.moduleUrl,
  }
}

const freshUrl = (url: string) => url.replace('/t100', `/t${NOW}`)
const importMaps = () =>
  [...document.querySelectorAll('script[type="importmap"]')].map((script) =>
    JSON.parse(script.textContent!),
  )

beforeEach(() => {
  vi.useFakeTimers({now: NOW * 1000, toFake: ['Date']})
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      url: url.includes('vision')
        ? 'https://modules.sanity-cdn.com/modules/v1/@sanity__vision/6.20.0/bare/index.mjs'
        : 'https://modules.sanity-cdn.com/modules/v1/sanity/6.20.0/bare/index.mjs',
    })),
  )
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  delete globals.__SANITY_APP_ID__
  document.head.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createAutoUpdatesLoader', () => {
  test('loads from the module CDN through scoped import maps, with the app ID', async () => {
    const cdnStructure = {source: 'cdn'}
    const {appIdAtImport, load, moduleUrl} = setup({
      imports: {[`${freshUrl(SANITY_URL)}/structure`]: cdnStructure},
    })

    await expect(Promise.all([load('sanity/structure'), load('@sanity/vision')])).resolves.toEqual([
      cdnStructure,
      bundled,
    ])

    const imports = {
      '@sanity/vision': freshUrl(VISION_URL),
      '@sanity/vision/': `${freshUrl(VISION_URL)}/`,
      sanity: freshUrl(SANITY_URL),
      'sanity/': `${freshUrl(SANITY_URL)}/`,
    }
    expect(importMaps()).toEqual([
      expect.objectContaining({imports: expect.anything()}),
      {
        scopes: {
          'https://modules.sanity-cdn.com/modules/v1/@sanity__vision/6.20.0/bare/': imports,
          'https://modules.sanity-cdn.com/modules/v1/sanity/6.20.0/bare/': imports,
        },
      },
    ])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect([...document.querySelectorAll('link')].map((link) => link.href)).toEqual([
      `${freshUrl(SANITY_URL)}/index.css`,
    ])
    expect(moduleUrl('sanity')).toBe(freshUrl(SANITY_URL))
    expect(moduleUrl('@sanity/vision')).toBeUndefined()
    expect(appIdAtImport.get(`${freshUrl(SANITY_URL)}/structure`)).toBe('app1')
  })

  test("keeps another app's ID on the page", async () => {
    globals.__SANITY_APP_ID__ = 'other-app'
    const {load} = setup({imports: {[freshUrl(SANITY_URL)]: {}}})

    await load('sanity')

    expect(globals.__SANITY_APP_ID__).toBe('other-app')
  })

  test("uses the bundled copy when the document's react is another instance", async () => {
    const {load} = setup({documentReact: {createContext() {}}})

    await expect(load('sanity')).resolves.toBe(bundled)
    expect(fetch).not.toHaveBeenCalled()
    expect(globals.__SANITY_APP_ID__).toBeUndefined()
  })

  test('uses the bundled copy when the browser ignores an added import map', async () => {
    const {load} = setup({importMapsApply: false})

    await expect(load('sanity')).resolves.toBe(bundled)
    expect(fetch).not.toHaveBeenCalled()
  })

  test('uses the bundled copy when the module CDN cannot be resolved', async () => {
    vi.mocked(fetch).mockResolvedValue({ok: false, status: 404} as Response)
    const {load} = setup()

    await expect(load('sanity')).resolves.toBe(bundled)
    expect(importMaps()).toHaveLength(1)
  })
})

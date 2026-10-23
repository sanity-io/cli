// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createAutoUpdatesLoader} from '../autoUpdatesLoader.js'
import {importThroughShim} from '../autoUpdatesShim.js'

vi.mock('../autoUpdatesShim.js', () => ({importThroughShim: vi.fn()}))

const SANITY_URL = 'https://sanity-cdn.com/v1/modules/by-app/app1/t100/%5E6.17.0/sanity'
const SDK_URL = 'https://sanity-cdn.com/v1/modules/by-app/app1/t100/%5E2.0.0/@sanity__sdk'
const NOW = 1_800_000_000

const pageReact = {createContext() {}}
const pageJsxRuntime = {jsx() {}}
const bundled = {source: 'bundled'}
const freshUrl = (url: string) => url.replace('/t100', `/t${NOW}`)
const cdnModules: Record<string, Record<string, unknown>> = {
  [`${freshUrl(SANITY_URL)}/structure`]: {source: 'cdn structure'},
  [freshUrl(SANITY_URL)]: {source: 'cdn sanity'},
}

function setup({appJsxRuntime = pageJsxRuntime, appReact = pageReact} = {}) {
  const loader = createAutoUpdatesLoader({
    appId: 'app1',
    importModule: async (specifier) => {
      if (specifier === 'react') return pageReact
      if (specifier === 'react/jsx-runtime') return pageJsxRuntime
      throw new TypeError(`Failed to resolve module specifier "${specifier}"`)
    },
    packages: [
      {cssUrl: `${SANITY_URL}/index.css`, name: 'sanity', url: SANITY_URL},
      {cssUrl: `${SDK_URL}/index.css`, name: '@sanity/sdk', url: SDK_URL},
    ],
    shared: {
      react: async () => ({...appReact, __moduleExports: appReact}),
      'react/jsx-runtime': async () => appJsxRuntime,
    },
    specifiers: ['sanity', 'sanity/structure'],
  })

  return {
    load: (specifier: string) => loader.load(specifier, async () => bundled),
    moduleUrl: loader.moduleUrl,
  }
}

beforeEach(() => {
  vi.useFakeTimers({now: NOW * 1000, toFake: ['Date']})
  vi.mocked(importThroughShim).mockResolvedValue(async (url) => {
    if (url in cdnModules) return cdnModules[url]
    throw new TypeError(`Failed to fetch ${url}`)
  })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  document.head.replaceChildren()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('createAutoUpdatesLoader', () => {
  test("loads the module CDN packages as the app's own instance, with CSS for the ones it imports", async () => {
    const {load, moduleUrl} = setup()

    await expect(load('sanity/structure')).resolves.toBe(
      cdnModules[`${freshUrl(SANITY_URL)}/structure`],
    )

    expect(importThroughShim).toHaveBeenCalledWith({
      appId: 'app1',
      imports: {
        '@sanity/sdk': freshUrl(SDK_URL),
        '@sanity/sdk/': `${freshUrl(SDK_URL)}/`,
        sanity: freshUrl(SANITY_URL),
        'sanity/': `${freshUrl(SANITY_URL)}/`,
      },
      ownInstances: {},
    })
    expect([...document.querySelectorAll('link')].map((link) => link.href)).toEqual([
      `${freshUrl(SANITY_URL)}/index.css`,
    ])
    expect(moduleUrl('sanity')).toBe(freshUrl(SANITY_URL))
  })

  test("maps shared packages to the app's own instances where they differ from the page's", async () => {
    const appReact = {createContext() {}}
    const appJsxRuntime = {jsx() {}}
    const {load} = setup({appJsxRuntime, appReact})

    await load('sanity')

    expect(importThroughShim).toHaveBeenCalledWith(
      expect.objectContaining({
        ownInstances: {
          react: {...appReact, __moduleExports: appReact},
          'react/jsx-runtime': appJsxRuntime,
        },
      }),
    )
  })

  test('uses the bundled copy of every package when one fails to load from the module CDN', async () => {
    vi.mocked(importThroughShim).mockResolvedValue(async (url) => {
      if (url.endsWith('/structure')) throw new TypeError(`Failed to fetch ${url}`)
      return cdnModules[url]
    })
    const {load, moduleUrl} = setup()

    await expect(load('sanity')).resolves.toBe(bundled)
    expect(moduleUrl('sanity')).toBeUndefined()
    expect(document.querySelectorAll('link')).toHaveLength(0)
  })

  test('uses the bundled copy when es-module-shims fails to load', async () => {
    vi.mocked(importThroughShim).mockRejectedValue(new Error('Failed to fetch es-module-shims'))
    const {load} = setup()

    await expect(load('sanity')).resolves.toBe(bundled)
  })
})

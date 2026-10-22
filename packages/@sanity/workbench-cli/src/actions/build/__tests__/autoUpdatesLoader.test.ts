// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createAutoUpdatesLoader} from '../autoUpdatesLoader.js'

const SANITY_URL = 'https://sanity-cdn.com/v1/modules/by-app/app1/t100/%5E6.17.0/sanity'
const VISION_URL = 'https://sanity-cdn.com/v1/modules/by-app/app1/t100/%5E6.17.0/@sanity__vision'
const NOW = 1_800_000_000

const react = {createContext() {}}
const bundled = {source: 'bundled'}

function setup({documentReact = react, imports = {} as Record<string, unknown>} = {}) {
  const importModule = vi.fn(async (specifier: string) => {
    if (specifier === 'react') return documentReact
    if (specifier in imports) return imports[specifier] as Record<string, unknown>

    throw new TypeError(`Failed to resolve module specifier "${specifier}"`)
  })
  const load = createAutoUpdatesLoader({
    importModule,
    packages: [
      {css: [`${SANITY_URL}/index.css`], name: 'sanity', url: SANITY_URL},
      {css: [], name: '@sanity/vision', url: VISION_URL},
    ],
    react,
  })

  return {importModule, load: (specifier: string) => load(specifier, async () => bundled)}
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
  document.head.replaceChildren()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createAutoUpdatesLoader', () => {
  test('loads from the module CDN through import maps scoped to the version directories', async () => {
    const cdnStructure = {source: 'cdn'}
    const {load} = setup({
      imports: {
        [`${freshUrl(SANITY_URL)}/structure`]: cdnStructure,
        'sanity-auto-updates-import-map-probe': {},
      },
    })

    await expect(load('sanity/structure')).resolves.toBe(cdnStructure)

    const imports = {
      '@sanity/vision': freshUrl(VISION_URL),
      '@sanity/vision/': `${freshUrl(VISION_URL)}/`,
      sanity: freshUrl(SANITY_URL),
      'sanity/': `${freshUrl(SANITY_URL)}/`,
    }
    expect(importMaps()).toContainEqual({
      scopes: {
        'https://modules.sanity-cdn.com/modules/v1/@sanity__vision/6.20.0/bare/': imports,
        'https://modules.sanity-cdn.com/modules/v1/sanity/6.20.0/bare/': imports,
      },
    })
    expect(fetch).toHaveBeenCalledWith(freshUrl(SANITY_URL), {method: 'HEAD'})
    expect([...document.querySelectorAll('link')].map((link) => link.href)).toEqual([
      `${freshUrl(SANITY_URL)}/index.css`,
    ])
  })

  test('prepares the module CDN once for every package', async () => {
    const {load} = setup({
      imports: {
        [freshUrl(SANITY_URL)]: {},
        [freshUrl(VISION_URL)]: {},
        'sanity-auto-updates-import-map-probe': {},
      },
    })

    await Promise.all([load('sanity'), load('@sanity/vision')])

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(importMaps()).toHaveLength(2)
  })

  test.each([
    {
      name: "the document's react is another instance",
      options: {documentReact: {createContext() {}}},
    },
    {
      name: 'the browser ignores an added import map',
      options: {imports: {}},
    },
  ])('uses the bundled copy when $name', async ({options}) => {
    const {load} = setup(options)

    await expect(load('sanity')).resolves.toBe(bundled)
    expect(fetch).not.toHaveBeenCalled()
  })

  test('uses the bundled copy when the module CDN cannot be resolved', async () => {
    vi.mocked(fetch).mockResolvedValue({ok: false, status: 404} as Response)
    const {load} = setup({imports: {'sanity-auto-updates-import-map-probe': {}}})

    await expect(load('sanity')).resolves.toBe(bundled)
    expect(importMaps()).toHaveLength(1)
  })

  test('uses the bundled copy for a module the CDN fails to serve', async () => {
    const {load} = setup({imports: {'sanity-auto-updates-import-map-probe': {}}})

    await expect(load('sanity')).resolves.toBe(bundled)
    // eslint-disable-next-line no-console -- asserting the warning the loader logs
    expect(console.warn).toHaveBeenCalledWith(
      'Failed to load sanity from the module CDN, using the bundled copy',
      expect.any(TypeError),
    )
  })
})

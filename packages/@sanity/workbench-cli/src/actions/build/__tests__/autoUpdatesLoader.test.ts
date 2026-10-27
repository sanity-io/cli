// @vitest-environment jsdom
import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {createAutoUpdatesLoader} from '../autoUpdatesLoader.js'

type Source = (url: string) => Promise<{code: string; url: string}>

const KEY = Symbol.for('sanity.autoUpdates')
const NOW = 1_800_000_000
// The app ID's `t9` segment must survive the timestamp refresh.
const SANITY_URL = 'https://sanity-cdn.com/v1/modules/by-app/t9app/t100/%5E6.17.0/sanity'
const CURRENT_SANITY_URL = SANITY_URL.replace('/t100', `/t${NOW}`)
const react = {default: {}, useState() {}}
const bundled = {source: 'bundled'}
const importModule = vi.fn(async (specifier: string) => ({specifier}))
const load = vi.fn(
  async (_appId: string, _request: {imports: object; source: Source}) => importModule,
)

function setup() {
  const loader = createAutoUpdatesLoader({
    appId: 't9app',
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

const sourceOf = () => load.mock.calls[0][1].source

beforeEach(() => {
  vi.useFakeTimers({now: NOW * 1000, toFake: ['Date']})
  Object.assign(globalThis, {[KEY]: {versions: {2: load}}})
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
    imports: {
      react: 'https://vendor.invalid/react',
      sanity: CURRENT_SANITY_URL,
      'sanity/': `${CURRENT_SANITY_URL}/`,
    },
    source: expect.any(Function),
  })
  expect(importModule).toHaveBeenCalledWith('sanity')
  expect([...document.querySelectorAll('link')].map((link) => link.href)).toEqual([
    `${CURRENT_SANITY_URL}/index.css`,
  ])
  expect(importMapUrl('sanity')).toBe(CURRENT_SANITY_URL)
})

test('fetches module CDN code as is, and re-exports its own vendor modules', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      text: async () => 'export {}',
      url: 'https://modules.sanity-cdn.com/x.mjs',
    })),
  )
  await setup().load('sanity')

  await expect(sourceOf()('https://sanity-cdn.com/x')).resolves.toEqual({
    code: 'export {}',
    url: 'https://modules.sanity-cdn.com/x.mjs',
  })
  const {code} = await sourceOf()('https://vendor.invalid/react')
  expect(code).toContain('export default m.default')
  expect(code).toContain('export {e0 as "useState"}')
  expect(new Function(`${code.replaceAll(/^export .*$/gm, '')}\nreturn m`)()).toBe(react)
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
  {versions: undefined, when: 'Workbench offers no contract version 2'},
  {versions: {2: async () => undefined}, when: "Workbench didn't prepare the app"},
])('uses the bundled copy when $when', async ({versions}) => {
  Object.assign(globalThis, {[KEY]: versions && {versions}})

  await expect(setup().load('sanity')).resolves.toBe(bundled)
})

// @vitest-environment jsdom
import {afterEach, beforeEach, expect, test, vi} from 'vitest'

type SourceHook = (
  url: string,
  fetchOpts: RequestInit,
  parent: string,
  defaultSourceHook: (url: string) => unknown,
) => Promise<{source: string; type: string; url?: string}>

const importShim = Object.assign(vi.fn(), {addImportMap: vi.fn()})
const globals = globalThis as unknown as {
  esmsInitOptions?: {source: SourceHook}
  importShim?: typeof importShim
}

const NOW = 1_800_000_000
// The app ID's `t9` segment must survive the timestamp refresh.
const SANITY_URL = 'https://sanity-cdn.com/v1/modules/by-app/t9app/t100/%5E6.17.0/sanity'
const CURRENT_SANITY_URL = SANITY_URL.replace('/t100', `/t${NOW}`)
const DIRECTORY = 'https://modules.sanity-cdn.com/modules/v1/sanity/6.20.0/bare/'
const react = {default: {}, useState() {}}
const bundled = {source: 'bundled'}
const inInstance = (id: string, path = '') => `${location.origin}/~${id}/${path}`
let source: SourceHook

async function setup(appId = 't9app') {
  const {createAutoUpdatesLoader} = await import('../autoUpdatesLoader.js')
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
  vi.resetModules()
  // es-module-shims reads its options once, when it evaluates.
  vi.doMock('es-module-shims', () => {
    source = globals.esmsInitOptions!.source
    globals.importShim = importShim
    return {}
  })
  importShim.mockImplementation(async (specifier: string) => ({specifier}))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  document.head.replaceChildren()
  delete globals.esmsInitOptions
  delete globals.importShim
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('sanity.autoUpdates.registry.v1')]
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

test("loads the auto-updated packages as the app's own instance, from current module CDN URLs", async () => {
  const {importMapUrl, load} = await setup()

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
  await (await setup()).load('sanity')

  const {source: reexport} = await source(inInstance('i0', 'vendor/react'), {}, '', vi.fn())

  expect(reexport).toContain('export default m.default')
  expect(reexport).toContain('export {e0 as "useState"}')
  expect(new Function(`${reexport.replaceAll(/^export .*$/gm, '')}\nreturn m`)()).toBe(react)
})

test('fetches module CDN code with the app ID inlined', async () => {
  await (await setup()).load('sanity')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      text: async () =>
        'var a=e=>e??(typeof __SANITY_APP_ID__==`string`?__SANITY_APP_ID__:void 0),b=globalThis.__SANITY_APP_ID__',
      url: `${DIRECTORY}dist-B.mjs`,
    })),
  )
  const defaultSourceHook = vi.fn()

  const loaded = await source(inInstance('i0', 'sanity-cdn.com/x'), {}, '', defaultSourceHook)

  expect(fetch).toHaveBeenCalledWith('https://sanity-cdn.com/x', {})
  expect(loaded).toEqual({
    source: 'var a=e=>e??(typeof "t9app"==`string`?"t9app":void 0),b=globalThis.__SANITY_APP_ID__',
    type: 'js',
    url: inInstance('i0', `${DIRECTORY.replace('https://', '')}dist-B.mjs`),
  })
  await source('https://example.com/other.mjs', {}, '', defaultSourceHook)
  expect(defaultSourceHook).toHaveBeenCalledWith('https://example.com/other.mjs', {}, '')
})

test('gives apps that load at the same time their own instance on one es-module-shims', async () => {
  // es-module-shims evaluates once, with the first options it finds.
  let options: unknown
  Object.defineProperty(globalThis, 'esmsInitOptions', {
    configurable: true,
    get: () => options,
    set: (value) => {
      options ??= value
    },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({ok: true, text: async () => '__SANITY_APP_ID__', url})),
  )
  const apps = await Promise.all([setup('app1'), setup('app2')])

  await Promise.all(apps.map((app) => app.load('sanity')))

  await expect(
    source(inInstance('i0', 'sanity-cdn.com/x'), {}, '', vi.fn()),
  ).resolves.toMatchObject({source: '"app1"'})
  await expect(
    source(inInstance('i1', 'sanity-cdn.com/x'), {}, '', vi.fn()),
  ).resolves.toMatchObject({source: '"app2"'})
})

test('uses the bundled copy of every package when one fails to load', async () => {
  importShim.mockImplementation(async (specifier: string) => {
    if (specifier === 'sanity/structure') throw new TypeError('Failed to fetch')
    return {specifier}
  })
  const {importMapUrl, load} = await setup()

  await expect(load('sanity')).resolves.toBe(bundled)
  expect(importMapUrl('sanity')).toBeUndefined()
  expect(document.querySelectorAll('link')).toHaveLength(0)
})

test('uses the bundled copy when another script loaded es-module-shims', async () => {
  globals.importShim = importShim
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  await expect((await setup()).load('sanity')).resolves.toBe(bundled)
  expect(warn).toHaveBeenCalledWith(
    expect.any(String),
    new Error('es-module-shims was loaded without the auto-updates hooks'),
  )
})

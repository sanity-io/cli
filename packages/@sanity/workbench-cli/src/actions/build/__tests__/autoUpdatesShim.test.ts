// @vitest-environment jsdom
import {afterEach, beforeEach, expect, test, vi} from 'vitest'

type SourceHook = (
  url: string,
  fetchOpts: RequestInit,
  parent: string,
  defaultSourceHook: (url: string) => unknown,
) => Promise<unknown>

const importShim = Object.assign(
  vi.fn(async () => ({source: 'shim'})),
  {addImportMap: vi.fn()},
)
const globals = globalThis as unknown as {
  esmsInitOptions?: {skip: string[]; source: SourceHook}
  importShim?: typeof importShim
}
// es-module-shims reads its options once, when it evaluates.
let optionsAtLoad: typeof globals.esmsInitOptions

const SANITY_URL = 'https://sanity-cdn.com/v1/modules/by-app/app1/t1/%5E6.17.0/sanity'
const DIRECTORY = 'https://modules.sanity-cdn.com/modules/v1/sanity/6.20.0/bare/'
const blobs: Blob[] = []
const inInstance = (id: string, url: string) =>
  `${location.origin}/~${id}/${url.replace('https://', '')}`

const importThroughShim: typeof import('../autoUpdatesShim.js').importThroughShim = async (
  options,
) => {
  const shim = await import('../autoUpdatesShim.js')

  return shim.importThroughShim(options)
}

beforeEach(() => {
  vi.resetModules()
  vi.doMock('es-module-shims', () => {
    optionsAtLoad = globals.esmsInitOptions
    globals.importShim = importShim
    return {}
  })
  const script = document.createElement('script')
  script.type = 'importmap'
  script.textContent = JSON.stringify({imports: {react: '/vendor/react/index-abc.mjs'}})
  document.head.append(script)
  // eslint-disable-next-line n/no-unsupported-features/node-builtins -- jsdom lacks it
  URL.createObjectURL = (blob: Blob) => `blob:${blobs.push(blob)}`
})

afterEach(() => {
  document.head.replaceChildren()
  delete globals.esmsInitOptions
  delete globals.importShim
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('sanity.autoUpdates.instances.v1')]
  blobs.length = 0
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

test("maps the app's CDN packages under its own prefix and its own instances to re-exports", async () => {
  const react = {default: {}, useState() {}}
  const importCdn = await importThroughShim({
    appId: 'app1',
    imports: {sanity: SANITY_URL, 'sanity/': `${SANITY_URL}/`},
    ownInstances: {react},
  })

  const documentReact = new URL('/vendor/react/index-abc.mjs', document.baseURI).href
  expect(optionsAtLoad?.skip).toEqual([documentReact])
  expect(importShim.addImportMap).toHaveBeenCalledWith({imports: {react: documentReact}})
  expect(importShim.addImportMap).toHaveBeenCalledWith({
    scopes: {
      [`${location.origin}/~i0/`]: {
        react: 'blob:1',
        sanity: inInstance('i0', SANITY_URL),
        'sanity/': `${inInstance('i0', SANITY_URL)}/`,
      },
    },
  })
  const reexport = await blobs[0].text()
  expect(reexport).toContain('export default m.default')
  expect(reexport).toContain('export {e0 as "useState"}')
  expect(new Function(`${reexport.replaceAll(/^export .*$/gm, '')}\nreturn m`)()).toBe(react)

  await importCdn(SANITY_URL)
  expect(importShim).toHaveBeenCalledWith(inInstance('i0', SANITY_URL))
})

test.each([
  {appId: 'app1', inlined: '"app1"'},
  {appId: undefined, inlined: 'undefined'},
])(
  'fetches modules from the module CDN with the app ID inlined as $inlined',
  async ({appId, inlined}) => {
    await importThroughShim({appId, imports: {}, ownInstances: {}})
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

    const loaded = await optionsAtLoad!.source(
      inInstance('i0', SANITY_URL),
      {},
      '',
      defaultSourceHook,
    )

    expect(fetch).toHaveBeenCalledWith(SANITY_URL, {})
    expect(loaded).toEqual({
      source: `var a=e=>e??(typeof ${inlined}==\`string\`?${inlined}:void 0),b=globalThis.__SANITY_APP_ID__`,
      type: 'js',
      url: inInstance('i0', `${DIRECTORY}dist-B.mjs`),
    })
    await optionsAtLoad!.source('https://example.com/other.mjs', {}, '', defaultSourceHook)
    expect(defaultSourceHook).toHaveBeenCalledWith('https://example.com/other.mjs', {}, '')
  },
)

test('gives every app its own instance on one es-module-shims', async () => {
  await importThroughShim({appId: 'app1', imports: {}, ownInstances: {}})
  const importCdn = await importThroughShim({appId: 'app2', imports: {}, ownInstances: {}})

  await importCdn(`${DIRECTORY}index.mjs`)
  expect(importShim).toHaveBeenCalledWith(inInstance('i1', `${DIRECTORY}index.mjs`))
})

test('refuses an es-module-shims another script loaded without its hooks', async () => {
  globals.importShim = importShim

  await expect(importThroughShim({appId: 'app1', imports: {}, ownInstances: {}})).rejects.toThrow(
    'es-module-shims was loaded without the auto-updates hooks',
  )
})

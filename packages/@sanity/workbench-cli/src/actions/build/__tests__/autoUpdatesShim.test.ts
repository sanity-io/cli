// @vitest-environment jsdom
import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {importThroughShim} from '../autoUpdatesShim.js'

const importShim = Object.assign(
  vi.fn(async () => ({source: 'shim'})),
  {addImportMap: vi.fn()},
)
const globals = globalThis as {esmsInitOptions?: object; importShim?: typeof importShim}
// es-module-shims reads its options once, when it evaluates.
let optionsAtLoad: object | undefined

vi.mock('es-module-shims', () => {
  optionsAtLoad = globals.esmsInitOptions
  globals.importShim = importShim
  return {}
})

const scopes = {'https://modules.sanity-cdn.com/modules/v1/sanity/6.20.0/bare/': {sanity: 'cdn'}}

beforeEach(() => {
  const script = document.createElement('script')
  script.type = 'importmap'
  script.textContent = JSON.stringify({imports: {react: '/vendor/react/index-abc.mjs'}})
  document.head.append(script)
})

afterEach(() => {
  document.head.replaceChildren()
  delete globals.esmsInitOptions
  delete globals.importShim
  vi.clearAllMocks()
})

test("maps the document's own entries and the CDN scopes, loading the document's natively", async () => {
  const importCdn = await importThroughShim(scopes)

  const react = new URL('/vendor/react/index-abc.mjs', document.baseURI).href
  expect(optionsAtLoad).toEqual({shimMode: true, skip: [react]})
  expect(importShim.addImportMap).toHaveBeenCalledWith({imports: {react}, scopes})
  await expect(importCdn('https://sanity-cdn.com/sanity')).resolves.toEqual({source: 'shim'})
  expect(importShim).toHaveBeenCalledWith('https://sanity-cdn.com/sanity')
})

test('reuses es-module-shims another app already loaded', async () => {
  globals.importShim = importShim

  await importThroughShim(scopes)

  expect(globals.esmsInitOptions).toBeUndefined()
  expect(importShim.addImportMap).toHaveBeenCalledWith(expect.objectContaining({scopes}))
})

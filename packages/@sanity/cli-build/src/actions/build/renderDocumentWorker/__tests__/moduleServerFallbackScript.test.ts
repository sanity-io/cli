import {JSDOM, VirtualConsole} from 'jsdom'
import {describe, expect, test, vi} from 'vitest'

import {decorateIndexWithBridgeScript} from '../../decorateIndexWithBridgeScript.js'
import {deferModuleScripts} from '../../deferModuleScripts.js'
import {addTimestampedImportMapScriptToHtml} from '../addTimestampImportMapScriptToHtml.js'

const RECOVERY_STORAGE_KEY = 'sanity:module-server-fallback'
const MODULE_SERVER_URL =
  'https://sanity-cdn.com/v1/modules/by-app/app123/t1700000000/%5E6.18.0/sanity'
const BUCKET = 'https://modules.sanity-cdn.com/modules/v1/sanity/6.18.0/bare'
const ENTRY_PATH = '/static/sanity-abc.js'

const studioHtml = deferModuleScripts(
  addTimestampedImportMapScriptToHtml(
    `<!DOCTYPE html><html><head></head><body><div id="sanity"></div><script src="${ENTRY_PATH}" type="module"></script></body></html>`,
    {
      imports: {
        react: '/vendor/react-abc.mjs',
        sanity: MODULE_SERVER_URL,
        'sanity/': `${MODULE_SERVER_URL}/`,
      },
      pinned: {
        cssUrls: [`${BUCKET}/index.css`],
        imports: {
          react: '/vendor/react-abc.mjs',
          sanity: `${BUCKET}/index.mjs`,
          'sanity/structure': `${BUCKET}/structure.mjs`,
        },
      },
    },
    [`${MODULE_SERVER_URL}/index.css`],
  ),
  {entryPath: ENTRY_PATH},
)

type FetchMock = (
  url: string,
  init: {headers: Record<string, string>; signal: AbortSignal},
) => Promise<Response>

function createClock() {
  const timers = new Map<number, {callback: () => void; dueAt: number}>()
  const clock = {nextId: 1, now: 0}
  const startTime = Date.now()
  return {
    advance(milliseconds: number) {
      clock.now += milliseconds
      const dueTimers = [...timers.entries()].filter(([, timer]) => timer.dueAt <= clock.now)
      for (const [timerId, timer] of dueTimers) {
        timers.delete(timerId)
        timer.callback()
      }
    },
    clearTimeout: (timerId: number) => timers.delete(timerId),
    // Only Date.now() is faked; real Date construction is untouched. This lets a test drive
    // wall-clock-dependent logic (the recovery window) through the same clock.advance().
    dateNow: () => startTime + clock.now,
    setTimeout(callback: () => void, delay: number) {
      const timerId = clock.nextId++
      timers.set(timerId, {callback, dueAt: clock.now + delay})
      return timerId
    },
  }
}

function loadStudio(options: {
  fetch: FetchMock
  html?: string
  prepareWindow?: (window: JSDOM['window']) => void
  url?: string
}) {
  const clock = createClock()
  const reloads: Error[] = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (error) => {
    if (error.message.includes('navigation')) reloads.push(error)
  })
  const fetchMock = vi.fn(options.fetch)
  const dom = new JSDOM(options.html ?? studioHtml, {
    beforeParse(window) {
      Object.assign(window, {
        clearTimeout: clock.clearTimeout,
        fetch: fetchMock,
        setTimeout: clock.setTimeout,
      })
      window.Date.now = clock.dateNow
      options.prepareWindow?.(window)
    },
    runScripts: 'dangerously',
    url: options.url ?? 'https://studio.example.com/',
    virtualConsole,
  })
  const {document} = dom.window

  return {
    clock,
    dispatchEntryEvent: (type: 'error' | 'load') =>
      document
        .querySelector('script[data-sanity-entry]')!
        .dispatchEvent(new dom.window.Event(type)),
    document,
    fetchMock,
    importMap: () => document.querySelector('script[type="importmap"]'),
    notice: () => document.querySelector('#__sanityModuleNotice'),
    reloads,
    window: dom.window,
  }
}

async function committedImportMap(studio: ReturnType<typeof loadStudio>) {
  await vi.waitFor(() => expect(studio.importMap()).not.toBeNull())
  const importMap = studio.importMap() as HTMLScriptElement
  return {
    fallbackReason: importMap.dataset.sanityModuleFallbackReason,
    imports: JSON.parse(importMap.textContent ?? '{}').imports as Record<string, string>,
    source: importMap.dataset.sanityModuleSource,
  }
}

// A failed probe waits out a short real-browser CSP-report grace period (driven by the fake
// clock) before deciding it wasn't answered. Flush pending microtasks with a real timer first,
// so the catch handler has registered that fake timer by the time this advances it.
async function settleFailedProbe(studio: ReturnType<typeof loadStudio>) {
  await new Promise((resolve) => setTimeout(resolve, 0))
  studio.clock.advance(100)
}

const answeringFetch: FetchMock = async () =>
  Response.json({packageUrl: `${BUCKET}/index.mjs`, packageVersion: '6.18.0'})

const hangingFetch: FetchMock = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')))
  })

function stylesheets(document: Document) {
  return [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) =>
    link.getAttribute('href'),
  )
}

describe('module server fallback loader', () => {
  test('commits the timestamped Module Server map when the probe answers', async () => {
    const studio = loadStudio({fetch: answeringFetch})

    const {fallbackReason, imports, source} = await committedImportMap(studio)

    expect(source).toBe('module-server')
    expect(fallbackReason).toBeUndefined()
    expect(imports.sanity).toMatch(
      /^https:\/\/sanity-cdn\.com\/v1\/modules\/by-app\/app123\/t\d+\/%5E6\.18\.0\/sanity$/,
    )
    expect(imports.sanity).not.toBe(MODULE_SERVER_URL)
    expect(imports['sanity/']).toBe(`${imports.sanity}/`)
    expect(imports.react).toBe('/vendor/react-abc.mjs')
    expect(studio.fetchMock).toHaveBeenCalledOnce()
    expect(studio.fetchMock).toHaveBeenCalledWith(
      imports.sanity,
      expect.objectContaining({headers: {Accept: 'application/json'}}),
    )
    expect(stylesheets(studio.document)).toEqual([`${imports.sanity}/index.css`])
  })

  test('starts the deferred entry script only after committing the map', async () => {
    const studio = loadStudio({fetch: answeringFetch})

    expect(studio.document.querySelector('script[data-sanity-entry]')?.getAttribute('type')).toBe(
      'sanity/deferred-module',
    )
    await committedImportMap(studio)

    const entry = studio.document.querySelector('script[data-sanity-entry]')!
    expect(entry.getAttribute('type')).toBe('module')
    expect(entry.getAttribute('src')).toBe(ENTRY_PATH)
    expect(studio.document.querySelectorAll('script[type="sanity/deferred-module"]')).toHaveLength(
      0,
    )
  })

  test('preconnects to Module Server and the bucket before probing', () => {
    const studio = loadStudio({fetch: hangingFetch})

    const preconnects = [...studio.document.querySelectorAll('link[rel="preconnect"]')].map(
      (link) => link.getAttribute('href'),
    )
    expect(preconnects).toEqual(['https://sanity-cdn.com', 'https://modules.sanity-cdn.com'])
  })

  test('commits the pinned bucket map when the probe times out', async () => {
    const studio = loadStudio({fetch: hangingFetch})

    studio.clock.advance(3999)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(studio.importMap()).toBeNull()

    studio.clock.advance(1)
    await settleFailedProbe(studio)
    const {fallbackReason, imports, source} = await committedImportMap(studio)

    expect(source).toBe('pinned')
    expect(fallbackReason).toBe('timeout')
    expect(imports).toEqual({
      react: '/vendor/react-abc.mjs',
      sanity: `${BUCKET}/index.mjs`,
      'sanity/structure': `${BUCKET}/structure.mjs`,
    })
    expect(stylesheets(studio.document)).toEqual([`${BUCKET}/index.css`])
    expect(studio.document.querySelector('link[rel="modulepreload"]')?.getAttribute('href')).toBe(
      `${BUCKET}/index.mjs`,
    )
  })

  test.each<[string, FetchMock]>([
    [
      'a network error',
      async () => {
        throw new TypeError('Failed to fetch')
      },
    ],
    ['a 429', async () => new Response('Too Many Requests', {status: 429})],
    ['a 5xx', async () => new Response('Bad Gateway', {status: 502})],
    ['a body without packageVersion', async () => Response.json({error: 'nope'})],
    ['a body that is not JSON', async () => new Response('<html></html>')],
  ])('commits the pinned bucket map when the probe gets %s', async (_reason, fetch) => {
    const studio = loadStudio({fetch})

    await settleFailedProbe(studio)
    const {fallbackReason, source} = await committedImportMap(studio)

    expect(source).toBe('pinned')
    expect(fallbackReason).toBe('error')
  })

  test('reloads once into the pinned map when the entry fails to load from Module Server', async () => {
    const studio = loadStudio({fetch: answeringFetch})
    await committedImportMap(studio)

    studio.dispatchEntryEvent('error')

    expect(studio.reloads).toHaveLength(1)
    expect(Number(studio.window.sessionStorage.getItem(RECOVERY_STORAGE_KEY))).toBeGreaterThan(0)
    expect(studio.notice()).toBeNull()
  })

  test('skips the probe and shows a notice instead of reloading again within a minute', async () => {
    const studio = loadStudio({
      fetch: answeringFetch,
      prepareWindow: (window) =>
        window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(Date.now() - 1000)),
    })

    const {fallbackReason, source} = await committedImportMap(studio)
    studio.dispatchEntryEvent('error')

    expect(source).toBe('pinned')
    expect(fallbackReason).toBe('recovery')
    expect(studio.fetchMock).not.toHaveBeenCalled()
    expect(studio.reloads).toHaveLength(0)
    expect(studio.notice()?.textContent).toContain('Sanity Studio could not load')
  })

  test('probes Module Server again once the last reload is over a minute old', async () => {
    const studio = loadStudio({
      fetch: answeringFetch,
      prepareWindow: (window) =>
        window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(Date.now() - 61_000)),
    })

    const {source} = await committedImportMap(studio)

    expect(source).toBe('module-server')
    expect(studio.fetchMock).toHaveBeenCalledOnce()
  })

  test('loads and shows a notice instead of reloading when session storage is blocked', async () => {
    const studio = loadStudio({
      fetch: answeringFetch,
      prepareWindow: (window) =>
        Object.defineProperty(window, 'sessionStorage', {
          get() {
            throw new Error('The operation is insecure.')
          },
        }),
    })

    const {source} = await committedImportMap(studio)
    studio.dispatchEntryEvent('error')

    expect(source).toBe('module-server')
    expect(studio.reloads).toHaveLength(0)
    expect(studio.notice()?.textContent).toContain('Sanity Studio could not load')
  })

  test('treats a probe blocked by connect-src as an answer and commits the module-server map', async () => {
    const studio = loadStudio({
      fetch: async () => {
        throw new TypeError('Failed to fetch')
      },
    })

    // Real browsers report the violation a tick or two after the fetch itself rejects, so the
    // loader waits out a short grace period before deciding; the fake clock stands in for that.
    const violation = Object.assign(new studio.window.Event('securitypolicyviolation'), {
      blockedURI: 'https://sanity-cdn.com/v1/modules/by-app/app123/blocked',
      effectiveDirective: 'connect-src',
    })
    studio.document.dispatchEvent(violation)
    await settleFailedProbe(studio)

    const {fallbackReason, source} = await committedImportMap(studio)
    expect(source).toBe('module-server')
    expect(fallbackReason).toBeUndefined()
  })

  test('does not treat an unrelated CSP violation as an answer', async () => {
    const studio = loadStudio({
      fetch: async () => {
        throw new TypeError('Failed to fetch')
      },
    })

    const violation = Object.assign(new studio.window.Event('securitypolicyviolation'), {
      blockedURI: 'https://fonts.example.com/font.woff2',
      effectiveDirective: 'font-src',
    })
    studio.document.dispatchEvent(violation)
    await settleFailedProbe(studio)

    const {source} = await committedImportMap(studio)
    expect(source).toBe('pinned')
  })

  test('scopes the recovery flag to the basePath, not the whole origin', async () => {
    const basePathEntryPath = '/studio-a/static/sanity-abc.js'
    const basePathHtml = deferModuleScripts(
      addTimestampedImportMapScriptToHtml(
        `<!DOCTYPE html><html><head></head><body><div id="sanity"></div><script src="${basePathEntryPath}" type="module"></script></body></html>`,
        {
          imports: {sanity: MODULE_SERVER_URL},
          pinned: {cssUrls: [], imports: {sanity: `${BUCKET}/index.mjs`}},
        },
      ),
      {entryPath: basePathEntryPath},
    )
    const studio = loadStudio({
      fetch: answeringFetch,
      html: basePathHtml,
      // Set under the unscoped (root) key, which belongs to a different basePath.
      prepareWindow: (window) =>
        window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(Date.now() - 1000)),
      url: 'https://studio.example.com/studio-a/structure',
    })

    const {source} = await committedImportMap(studio)

    expect(source).toBe('module-server')
    expect(studio.fetchMock).toHaveBeenCalledOnce()
  })

  test('clears the recovery flag once a pinned load succeeds', async () => {
    const studio = loadStudio({
      fetch: answeringFetch,
      prepareWindow: (window) =>
        window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(Date.now() - 1000)),
    })

    const {source} = await committedImportMap(studio)
    expect(source).toBe('pinned')

    studio.dispatchEntryEvent('load')

    expect(studio.window.sessionStorage.getItem(RECOVERY_STORAGE_KEY)).toBeNull()
  })

  test('copies the real nonce onto the promoted entry script', async () => {
    const studio = loadStudio({fetch: answeringFetch})
    const deferredEntry = studio.document.querySelector('script[data-sanity-entry]')!
    // Browsers hide a nonce from getAttribute once CSP applies; simulate that here, since jsdom
    // doesn't implement nonce hiding and would otherwise copy the real value either way.
    Object.defineProperty(deferredEntry, 'nonce', {configurable: true, value: 'the-real-nonce'})
    deferredEntry.setAttribute('nonce', '')

    await committedImportMap(studio)

    const entry = studio.document.querySelector('script[data-sanity-entry]')!
    expect((entry as HTMLScriptElement).nonce).toBe('the-real-nonce')
  })

  test('promotes a bridge script, a modulepreload and an inline module in document order', async () => {
    const htmlWithExtras = deferModuleScripts(
      decorateIndexWithBridgeScript(
        addTimestampedImportMapScriptToHtml(
          [
            '<!DOCTYPE html><html><head>',
            '<link rel="modulepreload" href="/static/vendor-abc.js">',
            '</head><body><div id="sanity"></div>',
            `<script src="${ENTRY_PATH}" type="module"></script>`,
            '<script type="module">import "sanity"</script>',
            '</body></html>',
          ].join(''),
          {
            imports: {sanity: MODULE_SERVER_URL},
            pinned: {cssUrls: [], imports: {sanity: `${BUCKET}/index.mjs`}},
          },
        ),
      ),
      {entryPath: ENTRY_PATH},
    )

    const studio = loadStudio({fetch: hangingFetch, html: htmlWithExtras})
    studio.clock.advance(4000)
    await settleFailedProbe(studio)
    await committedImportMap(studio)

    expect(studio.document.querySelectorAll('[type="sanity/deferred-module"]')).toHaveLength(0)
    expect(studio.document.querySelectorAll('[rel="sanity-deferred-modulepreload"]')).toHaveLength(
      0,
    )

    const bridge = studio.document.querySelector('[data-sanity-core]') as HTMLScriptElement
    expect(bridge.type).toBe('module')
    expect(bridge.async).toBe(true)

    const entry = studio.document.querySelector('[data-sanity-entry]') as HTMLScriptElement
    expect(entry.type).toBe('module')
    expect(entry.async).toBe(false)

    const inlineModule = [...studio.document.querySelectorAll('script[type="module"]')].find(
      (script) => script.textContent?.includes('import "sanity"'),
    )
    expect(inlineModule?.textContent).toBe('import "sanity"')

    const vendorPreload = studio.document.querySelector(
      'link[href="/static/vendor-abc.js"]',
    ) as HTMLLinkElement
    expect(vendorPreload.rel).toBe('modulepreload')

    const headChildren = [...studio.document.head.children]
    const importMapIndex = headChildren.indexOf(studio.importMap()!)
    const sanityPreloadIndex = headChildren.findIndex(
      (element) =>
        element.tagName === 'LINK' &&
        element.getAttribute('rel') === 'modulepreload' &&
        element.getAttribute('href') === `${BUCKET}/index.mjs`,
    )
    expect(sanityPreloadIndex).toBeGreaterThan(importMapIndex)
  })
})

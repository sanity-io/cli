import {JSDOM} from 'jsdom'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {decorateIndexWithEarlyAuthScript} from '../decorateIndexWithEarlyAuthScript'
import {__sanityEarlyAuthInit} from '../earlyAuthProbeScript'

const mockIsStaging = vi.hoisted(() => vi.fn<() => boolean>())

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    isStaging: mockIsStaging,
  }
})

const sampleHtml = '<html><head><script src="app.js"></script></head><body></body></html>'
const projectId = 'testproject123'

afterEach(() => {
  vi.clearAllMocks()
})

describe('decorateIndexWithEarlyAuthScript', () => {
  test('returns template unchanged when projectId is undefined', async () => {
    mockIsStaging.mockReturnValue(false)
    expect(await decorateIndexWithEarlyAuthScript(sampleHtml, undefined)).toBe(sampleHtml)
  })

  test('returns template unchanged when projectId is empty string', async () => {
    mockIsStaging.mockReturnValue(false)
    expect(await decorateIndexWithEarlyAuthScript(sampleHtml, '')).toBe(sampleHtml)
  })

  test('skips (returns template unchanged) when projectId fails the validity check', async () => {
    mockIsStaging.mockReturnValue(false)
    expect(await decorateIndexWithEarlyAuthScript(sampleHtml, '!!!')).toBe(sampleHtml)
    expect(await decorateIndexWithEarlyAuthScript(sampleHtml, 'my-proj!')).toBe(sampleHtml)
  })

  test('returns template unchanged when template is empty string', async () => {
    mockIsStaging.mockReturnValue(false)
    expect(await decorateIndexWithEarlyAuthScript('', projectId)).toBe('')
  })

  test('uses api.sanity.io when isStaging() returns false', async () => {
    mockIsStaging.mockReturnValue(false)
    const result = await decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain('api.sanity.io')
    expect(result).not.toContain('api.sanity.work')
  })

  test('uses api.sanity.io when SANITY_INTERNAL_ENV is unset (default)', async () => {
    mockIsStaging.mockReturnValue(false)
    const result = await decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain('api.sanity.io')
  })

  test('uses api.sanity.work when isStaging() returns true', async () => {
    mockIsStaging.mockReturnValue(true)
    const result = await decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain('api.sanity.work')
    expect(result).not.toContain('api.sanity.io')
  })

  test('injected script is the first child of <head>', async () => {
    mockIsStaging.mockReturnValue(false)
    const result = await decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    const earlyAuthIdx = result.indexOf('__sanityEarlyAuthInit')
    const appScriptIdx = result.indexOf('src="app.js"')
    expect(earlyAuthIdx).toBeGreaterThan(-1)
    expect(earlyAuthIdx).toBeLessThan(appScriptIdx)
  })

  test('preserves <head> attributes', async () => {
    mockIsStaging.mockReturnValue(false)
    const html = '<html><head lang="en"><script src="app.js"></script></head></html>'
    const result = await decorateIndexWithEarlyAuthScript(html, projectId)
    expect(result).toContain('<head lang="en">\n<script>')
  })

  test('script assigns window.__sanityEarlyAuth', async () => {
    mockIsStaging.mockReturnValue(false)
    const result = await decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain('window.__sanityEarlyAuth')
  })

  test('script references the storage-key prefix', async () => {
    mockIsStaging.mockReturnValue(false)
    const result = await decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain('__studio_auth_token_')
  })

  test('script contains the projectId and the users/me probe path', async () => {
    mockIsStaging.mockReturnValue(false)
    const result = await decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain(JSON.stringify(projectId))
    // The URL is assembled at runtime from the invocation arguments; the path
    // literal lives in the probe source, the version and tag arrive as args.
    expect(result).toContain('/users/me?tag=')
    expect(result).toContain(JSON.stringify('v2026-05-04'))
    expect(result).toContain(JSON.stringify('sanity.studio.auth.early-probe'))
  })

  test('script contains the Authorization-header branch for token auth', async () => {
    mockIsStaging.mockReturnValue(false)
    const result = await decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain('Authorization')
    expect(result).toContain('Bearer ')
  })

  test('script contains the credentials:include branch for cookie auth', async () => {
    mockIsStaging.mockReturnValue(false)
    const result = await decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain('credentials')
    expect(result).toContain('include')
  })

  test('injected script contains no module import/export syntax', async () => {
    mockIsStaging.mockReturnValue(false)
    const result = await decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    const scriptMatch = result.match(/<script>([\s\S]*?)<\/script>/)
    expect(scriptMatch).toBeTruthy()
    const scriptBody = scriptMatch![1]
    expect(scriptBody).not.toMatch(/^import\s/m)
    expect(scriptBody).not.toMatch(/^export\s/m)
  })

  test('inline script is under 4000 bytes raw (sanity check against accidental bloat)', async () => {
    mockIsStaging.mockReturnValue(false)
    const result = await decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    const scriptMatch = result.match(/<script>([\s\S]*?)<\/script>/)
    expect(scriptMatch).toBeTruthy()
    expect(scriptMatch![1].length).toBeLessThan(4000)
  })
})

function createRuntimeDom(html: string, beforeParseFn?: (window: Window) => void) {
  return new JSDOM(html, {
    beforeParse(window) {
      beforeParseFn?.(window as unknown as Window)
    },
    runScripts: 'dangerously',
    url: 'https://example.test/',
  })
}

describe('decorateIndexWithEarlyAuthScript - jsdom runtime tests', () => {
  const baseHtml = '<html><head></head><body></body></html>'
  const storedToken = 'tok-abc123'
  const storageKey = `__studio_auth_token_${projectId}`

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('token path: sets credential=token and calls fetch with Authorization header', async () => {
    mockIsStaging.mockReturnValue(false)
    const decorated = await decorateIndexWithEarlyAuthScript(baseHtml, projectId)

    const fetchCalls: {opts: RequestInit; url: string}[] = []

    const dom = createRuntimeDom(decorated, (win) => {
      win.localStorage.setItem(storageKey, JSON.stringify({token: storedToken}))
      win.fetch = (url: RequestInfo | URL, opts?: RequestInit) => {
        fetchCalls.push({opts: opts ?? {}, url: String(url)})
        return Promise.resolve(new Response('{}', {status: 200})) as ReturnType<typeof fetch>
      }
    })

    // Wait one tick for the inline script to execute
    await new Promise((resolve) => setTimeout(resolve, 0))

    const earlyAuth = (dom.window as unknown as Record<string, unknown>).__sanityEarlyAuth as
      | Record<string, unknown>
      | undefined

    expect(earlyAuth).toBeDefined()
    expect(earlyAuth?.credential).toBe('token')
    expect(earlyAuth?.token).toBe(storedToken)
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toBe(
      `https://${projectId}.api.sanity.io/v2026-05-04/users/me?tag=sanity.studio.auth.early-probe`,
    )
    expect((fetchCalls[0].opts.headers as Record<string, string>)?.Authorization).toBe(
      `Bearer ${storedToken}`,
    )
  })

  test('cookie path: sets credential=cookie and calls fetch with credentials:include', async () => {
    mockIsStaging.mockReturnValue(false)
    const decorated = await decorateIndexWithEarlyAuthScript(baseHtml, projectId)

    const fetchCalls: {opts: RequestInit; url: string}[] = []

    const dom = createRuntimeDom(decorated, (win) => {
      // no localStorage token
      win.fetch = (url: RequestInfo | URL, opts?: RequestInit) => {
        fetchCalls.push({opts: opts ?? {}, url: String(url)})
        return Promise.resolve(new Response('{}', {status: 200})) as ReturnType<typeof fetch>
      }
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    const earlyAuth = (dom.window as unknown as Record<string, unknown>).__sanityEarlyAuth as
      | Record<string, unknown>
      | undefined

    expect(earlyAuth).toBeDefined()
    expect(earlyAuth?.credential).toBe('cookie')
    expect(earlyAuth?.token).toBeNull()
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].opts.credentials).toBe('include')
  })

  test('error path: localStorage access throwing still allows script to complete', async () => {
    mockIsStaging.mockReturnValue(false)
    // The inner try/catch around localStorage means a storage error is swallowed —
    // the script still sets window.__sanityEarlyAuth with cookie credentials.
    const decorated = await decorateIndexWithEarlyAuthScript(baseHtml, projectId)

    const fetchCalls: {opts: RequestInit; url: string}[] = []

    const dom = createRuntimeDom(decorated, (win) => {
      // Make localStorage.getItem throw inside the inner try/catch
      const originalStorage = win.localStorage
      Object.defineProperty(win, 'localStorage', {
        configurable: true,
        get() {
          return {
            getItem() {
              throw new Error('storage blocked')
            },
            setItem: originalStorage.setItem.bind(originalStorage),
          }
        },
      })
      win.fetch = (url: RequestInfo | URL, opts?: RequestInit) => {
        fetchCalls.push({opts: opts ?? {}, url: String(url)})
        return Promise.resolve(new Response('{}', {status: 200})) as ReturnType<typeof fetch>
      }
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    const earlyAuth = (dom.window as unknown as Record<string, unknown>).__sanityEarlyAuth as
      | Record<string, unknown>
      | undefined

    // Inner catch swallows the localStorage error; script continues with cookie mode
    expect(earlyAuth).toBeDefined()
    expect(earlyAuth?.credential).toBe('cookie')
  })

  test('error path: fetch throwing leaves window.__sanityEarlyAuth unset', async () => {
    mockIsStaging.mockReturnValue(false)
    const decorated = await decorateIndexWithEarlyAuthScript(baseHtml, projectId)

    const dom = createRuntimeDom(decorated, (win) => {
      win.fetch = () => {
        throw new Error('network unavailable')
      }
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    const earlyAuth = (dom.window as unknown as Record<string, unknown>).__sanityEarlyAuth

    expect(earlyAuth).toBeUndefined()
  })

  test('result shape: 200 with a json body resolves to {type: ok, user}', async () => {
    mockIsStaging.mockReturnValue(false)
    const decorated = await decorateIndexWithEarlyAuthScript(baseHtml, projectId)

    const dom = createRuntimeDom(decorated, (win) => {
      win.fetch = () =>
        Promise.resolve(Response.json({id: 'user-1'}, {status: 200})) as ReturnType<typeof fetch>
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    const earlyAuth = (dom.window as unknown as Record<string, unknown>).__sanityEarlyAuth as
      | {promise: Promise<unknown>}
      | undefined

    expect(earlyAuth).toBeDefined()
    await expect(earlyAuth?.promise).resolves.toEqual({type: 'ok', user: {id: 'user-1'}})
  })

  test('result shape: 401 resolves to {type: unauthenticated}', async () => {
    mockIsStaging.mockReturnValue(false)
    const decorated = await decorateIndexWithEarlyAuthScript(baseHtml, projectId)

    const dom = createRuntimeDom(decorated, (win) => {
      win.fetch = () =>
        Promise.resolve(new Response('{}', {status: 401})) as ReturnType<typeof fetch>
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    const earlyAuth = (dom.window as unknown as Record<string, unknown>).__sanityEarlyAuth as
      | {promise: Promise<unknown>}
      | undefined

    expect(earlyAuth).toBeDefined()
    await expect(earlyAuth?.promise).resolves.toEqual({type: 'unauthenticated'})
  })

  test('result shape: 500 resolves to {type: error, status}', async () => {
    mockIsStaging.mockReturnValue(false)
    const decorated = await decorateIndexWithEarlyAuthScript(baseHtml, projectId)

    const dom = createRuntimeDom(decorated, (win) => {
      win.fetch = () =>
        Promise.resolve(new Response('{}', {status: 500})) as ReturnType<typeof fetch>
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    const earlyAuth = (dom.window as unknown as Record<string, unknown>).__sanityEarlyAuth as
      | {promise: Promise<unknown>}
      | undefined

    expect(earlyAuth).toBeDefined()
    await expect(earlyAuth?.promise).resolves.toEqual({status: 500, type: 'error'})
  })
})

function createStorageStub(): Storage {
  const entries = new Map<string, string>()
  return {
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size
    },
    removeItem: (key: string) => {
      entries.delete(key)
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
  }
}

// The cli-build vitest project runs in the `node` environment, which has no
// `window` or `localStorage`. The decorator tests above exercise the probe
// inside a self-constructed JSDOM; these direct tests stub the two browser
// globals the probe touches so the real module can be called in-process.
const apiVersion = 'v2026-05-04'
const requestTag = 'sanity.studio.auth.early-probe'
const tokenStorageKeyPrefix = '__studio_auth_token_'

describe('__sanityEarlyAuthInit (direct module unit tests)', () => {
  const apiHost = 'api.sanity.io'
  const storageKey = `${tokenStorageKeyPrefix}${projectId}`

  let windowStub: {__sanityEarlyAuth?: Record<string, unknown>}

  beforeEach(() => {
    windowStub = {}
    vi.stubGlobal('window', windowStub)
    vi.stubGlobal('localStorage', createStorageStub())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test('token selection: reads the stored token and sends an Authorization header', async () => {
    localStorage.setItem(storageKey, JSON.stringify({token: 'tok-direct'}))
    const fetchMock = vi.fn().mockResolvedValue(Response.json({id: 'user-1'}, {status: 200}))
    vi.stubGlobal('fetch', fetchMock)

    __sanityEarlyAuthInit(projectId, apiHost, apiVersion, requestTag, tokenStorageKeyPrefix)

    const earlyAuth = windowStub.__sanityEarlyAuth

    expect(earlyAuth?.credential).toBe('token')
    expect(earlyAuth?.token).toBe('tok-direct')
    expect(fetchMock).toHaveBeenCalledWith(
      `https://${projectId}.${apiHost}/v2026-05-04/users/me?tag=sanity.studio.auth.early-probe`,
      {headers: {Authorization: 'Bearer tok-direct'}},
    )
    await expect(earlyAuth?.promise as Promise<unknown>).resolves.toEqual({
      type: 'ok',
      user: {id: 'user-1'},
    })
  })

  test('cookie selection: no stored token sends credentials include', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', {status: 200}))
    vi.stubGlobal('fetch', fetchMock)

    __sanityEarlyAuthInit(projectId, apiHost, apiVersion, requestTag, tokenStorageKeyPrefix)

    const earlyAuth = windowStub.__sanityEarlyAuth

    expect(earlyAuth?.credential).toBe('cookie')
    expect(earlyAuth?.token).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {credentials: 'include'})
  })

  test('401 mapping resolves to {type: unauthenticated}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', {status: 401}))
    vi.stubGlobal('fetch', fetchMock)

    __sanityEarlyAuthInit(projectId, apiHost, apiVersion, requestTag, tokenStorageKeyPrefix)

    await expect(windowStub.__sanityEarlyAuth?.promise as Promise<unknown>).resolves.toEqual({
      type: 'unauthenticated',
    })
  })

  test('synchronous fetch failure leaves window.__sanityEarlyAuth unset', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('network unavailable')
      }),
    )

    __sanityEarlyAuthInit(projectId, apiHost, apiVersion, requestTag, tokenStorageKeyPrefix)

    expect(windowStub.__sanityEarlyAuth).toBeUndefined()
  })
})

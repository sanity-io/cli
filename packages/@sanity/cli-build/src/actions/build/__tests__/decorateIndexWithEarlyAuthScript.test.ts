import {JSDOM} from 'jsdom'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {decorateIndexWithEarlyAuthScript} from '../decorateIndexWithEarlyAuthScript'

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
  test('returns template unchanged when projectId is undefined', () => {
    mockIsStaging.mockReturnValue(false)
    expect(decorateIndexWithEarlyAuthScript(sampleHtml, undefined)).toBe(sampleHtml)
  })

  test('returns template unchanged when projectId is empty string', () => {
    mockIsStaging.mockReturnValue(false)
    expect(decorateIndexWithEarlyAuthScript(sampleHtml, '')).toBe(sampleHtml)
  })

  test('returns template unchanged when projectId sanitizes to empty', () => {
    mockIsStaging.mockReturnValue(false)
    expect(decorateIndexWithEarlyAuthScript(sampleHtml, '!!!')).toBe(sampleHtml)
  })

  test('returns template unchanged when template is empty string', () => {
    mockIsStaging.mockReturnValue(false)
    expect(decorateIndexWithEarlyAuthScript('', projectId)).toBe('')
  })

  test('uses api.sanity.io when isStaging() returns false', () => {
    mockIsStaging.mockReturnValue(false)
    const result = decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain('api.sanity.io')
    expect(result).not.toContain('api.sanity.work')
  })

  test('uses api.sanity.io when SANITY_INTERNAL_ENV is unset (default)', () => {
    mockIsStaging.mockReturnValue(false)
    const result = decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain('api.sanity.io')
  })

  test('uses api.sanity.work when isStaging() returns true', () => {
    mockIsStaging.mockReturnValue(true)
    const result = decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain('api.sanity.work')
    expect(result).not.toContain('api.sanity.io')
  })

  test('injected script is the first child of <head>', () => {
    mockIsStaging.mockReturnValue(false)
    const result = decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    const earlyAuthIdx = result.indexOf('__sanityEarlyAuthInit')
    const appScriptIdx = result.indexOf('src="app.js"')
    expect(earlyAuthIdx).toBeGreaterThan(-1)
    expect(earlyAuthIdx).toBeLessThan(appScriptIdx)
  })

  test('preserves <head> attributes', () => {
    mockIsStaging.mockReturnValue(false)
    const html = '<html><head lang="en"><script src="app.js"></script></head></html>'
    const result = decorateIndexWithEarlyAuthScript(html, projectId)
    expect(result).toContain('<head lang="en">\n<script>')
  })

  test('script assigns window.__sanityEarlyAuth', () => {
    mockIsStaging.mockReturnValue(false)
    const result = decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain('window.__sanityEarlyAuth')
  })

  test('script references the correct storage key for the projectId', () => {
    mockIsStaging.mockReturnValue(false)
    const result = decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain(`'__studio_auth_token_'+`)
  })

  test('script contains the projectId in the request URL', () => {
    mockIsStaging.mockReturnValue(false)
    const result = decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain(JSON.stringify(projectId))
    expect(result).toContain('/users/me?tag=sanity.studio.auth.early-probe')
  })

  test('script contains the Authorization-header branch for token auth', () => {
    mockIsStaging.mockReturnValue(false)
    const result = decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain('Authorization')
    expect(result).toContain('Bearer ')
  })

  test('script contains the credentials:include branch for cookie auth', () => {
    mockIsStaging.mockReturnValue(false)
    const result = decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    expect(result).toContain("{credentials:'include'}")
  })

  test('inline script is under 1500 bytes raw (sanity check against accidental bloat)', () => {
    mockIsStaging.mockReturnValue(false)
    const result = decorateIndexWithEarlyAuthScript(sampleHtml, projectId)
    const scriptMatch = result.match(/<script>([\s\S]*?)<\/script>/)
    expect(scriptMatch).toBeTruthy()
    expect(scriptMatch![1].length).toBeLessThan(1500)
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
    const decorated = decorateIndexWithEarlyAuthScript(baseHtml, projectId)

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
    expect(fetchCalls[0].url).toContain(`${projectId}.api.sanity.io`)
    expect((fetchCalls[0].opts.headers as Record<string, string>)?.Authorization).toBe(
      `Bearer ${storedToken}`,
    )
  })

  test('cookie path: sets credential=cookie and calls fetch with credentials:include', async () => {
    mockIsStaging.mockReturnValue(false)
    const decorated = decorateIndexWithEarlyAuthScript(baseHtml, projectId)

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
    const decorated = decorateIndexWithEarlyAuthScript(baseHtml, projectId)

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
    const decorated = decorateIndexWithEarlyAuthScript(baseHtml, projectId)

    const dom = createRuntimeDom(decorated, (win) => {
      win.fetch = () => {
        throw new Error('network unavailable')
      }
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    const earlyAuth = (dom.window as unknown as Record<string, unknown>).__sanityEarlyAuth

    expect(earlyAuth).toBeUndefined()
  })
})

import {afterEach, describe, expect, test, vi} from 'vitest'

import {type DebugFunction} from '../../types.js'

let browserEnv: typeof import('../browser.js')

describe('browser env', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('useColors', () => {
    test('returns true by default (modern browsers)', async () => {
      browserEnv = await import('../browser.js')
      expect(browserEnv.browserEnv.useColors()).toBe(true)
    })
  })

  describe('save / load', () => {
    test('save() sets localStorage.debug', async () => {
      const store = new Map<string, string>()
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, val: string) => store.set(key, val),
      })
      browserEnv = await import('../browser.js')
      browserEnv.browserEnv.save('test:*')
      expect(store.get('debug')).toBe('test:*')
    })

    test('save(undefined) removes localStorage.debug', async () => {
      const store = new Map<string, string>([['debug', 'old']])
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => store.get(key) ?? null,
        removeItem: (key: string) => store.delete(key),
        setItem: (key: string, val: string) => store.set(key, val),
      })
      browserEnv = await import('../browser.js')
      browserEnv.browserEnv.save(undefined)
      expect(store.has('debug')).toBe(false)
    })

    test('load() reads from localStorage', async () => {
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => (key === 'debug' ? 'foo:*' : null),
        removeItem: vi.fn(),
        setItem: vi.fn(),
      })
      browserEnv = await import('../browser.js')
      expect(browserEnv.browserEnv.load()).toBe('foo:*')
    })

    test('load() handles localStorage errors gracefully', async () => {
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('Access denied')
        },
        removeItem: vi.fn(),
        setItem: vi.fn(),
      })
      browserEnv = await import('../browser.js')
      expect(browserEnv.browserEnv.load()).toBeUndefined()
    })
  })

  describe('formatArgs', () => {
    test('adds %c color directives when useColors=true', async () => {
      browserEnv = await import('../browser.js')
      const args: unknown[] = ['test message']
      const context = {
        color: '#FF0000',
        diff: 100,
        namespace: 'myapp',
        useColors: true,
      }
      browserEnv.browserEnv.formatArgs.call(context as unknown as DebugFunction, args)
      expect(args[0]).toContain('%c')
      expect(args[0]).toContain('myapp')
    })

    test('plain format when useColors=false', async () => {
      browserEnv = await import('../browser.js')
      const args: unknown[] = ['test message']
      const context = {
        color: '#FF0000',
        diff: 100,
        namespace: 'myapp',
        useColors: false,
      }
      browserEnv.browserEnv.formatArgs.call(context as unknown as DebugFunction, args)
      expect(args[0]).toContain('myapp')
      expect(args[0]).not.toContain('%c')
    })
  })

  describe('formatters', () => {
    test('%j formats as JSON', async () => {
      browserEnv = await import('../browser.js')
      const formatter = browserEnv.browserEnv.formatters.j
      const result = formatter.call({} as DebugFunction, {a: 1})
      expect(result).toBe('{"a":1}')
    })

    test('%j handles circular references', async () => {
      browserEnv = await import('../browser.js')
      const formatter = browserEnv.browserEnv.formatters.j
      const obj: Record<string, unknown> = {a: 1}
      obj.self = obj
      const result = formatter.call({} as DebugFunction, obj)
      expect(result).toContain('UnexpectedJSONParseError')
    })
  })
})

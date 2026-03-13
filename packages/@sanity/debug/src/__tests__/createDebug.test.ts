import {afterEach, describe, expect, test, vi} from 'vitest'

import {createDebugFactory} from '../createDebug.js'
import {type DebugEnv, type DebugFunction} from '../types.js'

function createTestEnv(overrides: Partial<DebugEnv> = {}): DebugEnv {
  return {
    colors: () => [1, 2, 3, 4, 5, 6],
    formatArgs: vi.fn(),
    formatters: {},
    load: () => undefined,
    log: vi.fn(),
    save: vi.fn(),
    useColors: () => false,
    ...overrides,
  }
}

describe('enable / disable / enabled', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('enable() parses comma-separated namespaces', () => {
    const env = createTestEnv()
    const {enable, enabled} = createDebugFactory(env)

    enable('foo,bar')
    expect(enabled('foo')).toBe(true)
    expect(enabled('bar')).toBe(true)
    expect(enabled('baz')).toBe(false)
  })

  test('enable() parses space-separated namespaces', () => {
    const env = createTestEnv()
    const {enable, enabled} = createDebugFactory(env)

    enable('foo bar')
    expect(enabled('foo')).toBe(true)
    expect(enabled('bar')).toBe(true)
  })

  test('enable() supports wildcard *', () => {
    const env = createTestEnv()
    const {enable, enabled} = createDebugFactory(env)

    enable('*')
    expect(enabled('anything')).toBe(true)
    expect(enabled('foo:bar:baz')).toBe(true)
  })

  test('enable() supports namespace:* wildcards', () => {
    const env = createTestEnv()
    const {enable, enabled} = createDebugFactory(env)

    enable('foo:*')
    expect(enabled('foo:bar')).toBe(true)
    expect(enabled('foo:bar:baz')).toBe(true)
    expect(enabled('foo')).toBe(false)
    expect(enabled('bar')).toBe(false)
  })

  test('enable() supports skip patterns with -', () => {
    const env = createTestEnv()
    const {enable, enabled} = createDebugFactory(env)

    enable('foo:*,-foo:bar')
    expect(enabled('foo:baz')).toBe(true)
    expect(enabled('foo:bar')).toBe(false)
  })

  test('skip patterns take precedence over enables', () => {
    const env = createTestEnv()
    const {enable, enabled} = createDebugFactory(env)

    enable('*,-secret:*')
    expect(enabled('anything')).toBe(true)
    expect(enabled('secret:key')).toBe(false)
  })

  test('disable() returns previous namespaces and clears', () => {
    const env = createTestEnv()
    const {disable, enable, enabled} = createDebugFactory(env)

    enable('foo,bar,-baz')
    const prev = disable()
    expect(prev).toBe('foo,bar,-baz')
    expect(enabled('foo')).toBe(false)
  })

  test('enable() persists via env.save()', () => {
    const env = createTestEnv()
    const {enable} = createDebugFactory(env)

    enable('foo:*')
    expect(env.save).toHaveBeenCalledWith('foo:*')
  })

  test('enable("") clears and saves undefined', () => {
    const env = createTestEnv()
    const {enable, enabled} = createDebugFactory(env)

    enable('foo')
    enable('')
    expect(enabled('foo')).toBe(false)
    expect(env.save).toHaveBeenLastCalledWith(undefined)
  })

  test('loads persisted namespaces on factory creation', () => {
    const env = createTestEnv({load: () => 'persisted:*'})
    const {enabled} = createDebugFactory(env)

    expect(enabled('persisted:foo')).toBe(true)
  })
})

describe('createDebug', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('creates instance with correct namespace', () => {
    const env = createTestEnv()
    const {createDebug} = createDebugFactory(env)
    const debug = createDebug('test:ns')
    expect(debug.namespace).toBe('test:ns')
  })

  test('instance has color from palette', () => {
    const env = createTestEnv({colors: () => [10, 20, 30]})
    const {createDebug} = createDebugFactory(env)
    const debug = createDebug('test')
    expect([10, 20, 30]).toContain(debug.color)
  })

  test('instance.enabled reflects global enable state', () => {
    const env = createTestEnv()
    const {createDebug, enable} = createDebugFactory(env)
    const debug = createDebug('myapp')

    expect(debug.enabled).toBe(false)
    enable('myapp')
    expect(debug.enabled).toBe(true)
    enable('')
    expect(debug.enabled).toBe(false)
  })

  test('instance.enabled can be overridden per-instance', () => {
    const env = createTestEnv()
    const {createDebug} = createDebugFactory(env)
    const debug = createDebug('myapp')

    expect(debug.enabled).toBe(false)
    debug.enabled = true
    expect(debug.enabled).toBe(true)
  })

  test('disabled instance does not call log', () => {
    const env = createTestEnv()
    const {createDebug} = createDebugFactory(env)
    const debug = createDebug('myapp')

    debug('should not log')
    expect(env.log).not.toHaveBeenCalled()
    expect(env.formatArgs).not.toHaveBeenCalled()
  })

  test('enabled instance calls formatArgs then log', () => {
    const env = createTestEnv()
    const {createDebug, enable} = createDebugFactory(env)
    enable('myapp')
    const debug = createDebug('myapp')

    debug('hello %s', 'world')

    expect(env.formatArgs).toHaveBeenCalledOnce()
    expect(env.log).toHaveBeenCalledOnce()
  })

  test('coerces Error to stack trace', () => {
    const logArgs: unknown[][] = []
    const env = createTestEnv({
      formatArgs: vi.fn(),
      log: (...args: unknown[]) => {
        logArgs.push(args)
      },
    })
    const {createDebug, enable} = createDebugFactory(env)
    enable('myapp')
    const debug = createDebug('myapp')

    const err = new Error('test error')
    debug(err)

    expect(logArgs[0][0]).toContain('%O')
  })

  test('non-string first arg gets %O prepended', () => {
    const formatted: unknown[][] = []
    const env = createTestEnv({
      formatArgs(this: DebugFunction, args: unknown[]) {
        formatted.push([...args])
      },
    })
    const {createDebug, enable} = createDebugFactory(env)
    enable('myapp')
    const debug = createDebug('myapp')

    debug({key: 'value'})
    expect(formatted[0][0]).toBe('%O')
  })

  test('sets diff/prev/curr on each call', () => {
    const env = createTestEnv({formatArgs: vi.fn()})
    const {createDebug, enable} = createDebugFactory(env)
    enable('myapp')
    const debug = createDebug('myapp')

    debug('first')
    expect(debug.diff).toBe(0)
    expect(debug.curr).toBeTypeOf('number')

    const firstCurr = debug.curr

    const start = Date.now()
    while (Date.now() - start < 5) {
      // busy wait
    }

    debug('second')
    expect(debug.prev).toBe(firstCurr)
    expect(debug.diff).toBeGreaterThan(0)
  })

  test('per-instance log override takes precedence', () => {
    const instanceLog = vi.fn()
    const env = createTestEnv({formatArgs: vi.fn()})
    const {createDebug, enable} = createDebugFactory(env)
    enable('myapp')
    const debug = createDebug('myapp')
    debug.log = instanceLog

    debug('hello')
    expect(instanceLog).toHaveBeenCalledOnce()
    expect(env.log).not.toHaveBeenCalled()
  })
})

describe('extend', () => {
  test('creates child with concatenated namespace', () => {
    const env = createTestEnv()
    const {createDebug} = createDebugFactory(env)
    const parent = createDebug('app')
    const child = parent.extend('sub')
    expect(child.namespace).toBe('app:sub')
  })

  test('supports custom delimiter', () => {
    const env = createTestEnv()
    const {createDebug} = createDebugFactory(env)
    const parent = createDebug('app')
    const child = parent.extend('sub', '--')
    expect(child.namespace).toBe('app--sub')
  })

  test('child inherits parent log override', () => {
    const customLog = vi.fn()
    const env = createTestEnv({formatArgs: vi.fn()})
    const {createDebug, enable} = createDebugFactory(env)
    enable('*')
    const parent = createDebug('app')
    parent.log = customLog
    const child = parent.extend('sub')

    child('hello')
    expect(customLog).toHaveBeenCalledOnce()
  })
})

describe('formatters', () => {
  test('custom formatters are applied via %X', () => {
    const env = createTestEnv({
      formatArgs: vi.fn(),
      formatters: {
        h(v: unknown) {
          return `<${String(v)}>`
        },
      },
    })
    const {createDebug, enable} = createDebugFactory(env)
    enable('myapp')
    const debug = createDebug('myapp')

    const logArgs: unknown[][] = []
    debug.log = (...args: unknown[]) => {
      logArgs.push(args)
    }

    debug('value: %h', 'test')
    expect(logArgs[0][0]).toContain('<test>')
  })

  test('%% produces literal %', () => {
    const env = createTestEnv({formatArgs: vi.fn()})
    const {createDebug, enable} = createDebugFactory(env)
    enable('myapp')
    const debug = createDebug('myapp')

    const logArgs: unknown[][] = []
    debug.log = (...args: unknown[]) => {
      logArgs.push(args)
    }

    debug('100%% done')
    expect(logArgs[0][0]).toContain('100% done')
  })

  test('unknown format specifiers are left as-is', () => {
    const env = createTestEnv({formatArgs: vi.fn()})
    const {createDebug, enable} = createDebugFactory(env)
    enable('myapp')
    const debug = createDebug('myapp')

    const logArgs: unknown[][] = []
    debug.log = (...args: unknown[]) => {
      logArgs.push(args)
    }

    debug('test %z value', 'arg')
    expect(logArgs[0][0]).toContain('%z')
    expect(logArgs[0]).toHaveLength(2)
  })

  test('formatters object is shared and mutable', () => {
    const env = createTestEnv({formatArgs: vi.fn()})
    const {createDebug, enable, formatters} = createDebugFactory(env)
    enable('myapp')

    formatters.x = (v: unknown) => `[${String(v)}]`

    const debug = createDebug('myapp')
    const logArgs: unknown[][] = []
    debug.log = (...args: unknown[]) => {
      logArgs.push(args)
    }

    debug('val: %x', 42)
    expect(logArgs[0][0]).toContain('[42]')
  })
})

describe('wildcard matching edge cases', () => {
  test('empty namespace never matches', () => {
    const env = createTestEnv()
    const {enable, enabled} = createDebugFactory(env)
    enable('foo')
    expect(enabled('')).toBe(false)
  })

  test('multiple wildcards in pattern', () => {
    const env = createTestEnv()
    const {enable, enabled} = createDebugFactory(env)
    enable('*:*:*')
    expect(enabled('a:b:c')).toBe(true)
    expect(enabled('a:b')).toBe(false)
  })

  test('exact match without wildcards', () => {
    const env = createTestEnv()
    const {enable, enabled} = createDebugFactory(env)
    enable('exact:match')
    expect(enabled('exact:match')).toBe(true)
    expect(enabled('exact:match:extra')).toBe(false)
    expect(enabled('exact')).toBe(false)
  })

  test('trailing wildcard matches everything after', () => {
    const env = createTestEnv()
    const {enable, enabled} = createDebugFactory(env)
    enable('app:*')
    expect(enabled('app:')).toBe(true)
    expect(enabled('app:anything:here')).toBe(true)
  })
})

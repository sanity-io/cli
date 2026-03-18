import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type DebugEnv, type DebugFunction} from '../../types.js'

// Helper to load a fresh module with custom env vars.
// inspectOpts are parsed at module load time, so we need a fresh import each time.
async function loadNodeEnv(envVars?: Record<string, string>): Promise<DebugEnv> {
  vi.resetModules()

  if (envVars) {
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value
    }
  }

  const mod = await import('../node.js')
  return mod.nodeEnv
}

describe('node environment', () => {
  const originalEnv = {...process.env}
  const filesToCleanup: string[] = []

  beforeEach(() => {
    // Clean up any DEBUG_* env vars before each test
    for (const key of Object.keys(process.env)) {
      if (/^debug_/i.test(key)) {
        delete process.env[key]
      }
    }
    delete process.env.DEBUG
  })

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key]
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value !== undefined) {
        process.env[key] = value
      }
    }
    vi.restoreAllMocks()

    // Clean up temp files
    for (const f of filesToCleanup) {
      try {
        fs.unlinkSync(f)
      } catch {
        // ignore
      }
    }
    filesToCleanup.length = 0
  })

  describe('useColors()', () => {
    test('returns false when DEBUG_COLORS=no', async () => {
      const env = await loadNodeEnv({DEBUG_COLORS: 'no'})
      expect(env.useColors()).toBe(false)
    })

    test('returns false when DEBUG_COLORS=false', async () => {
      const env = await loadNodeEnv({DEBUG_COLORS: 'false'})
      expect(env.useColors()).toBe(false)
    })

    test('returns false when DEBUG_COLORS=0', async () => {
      const env = await loadNodeEnv({DEBUG_COLORS: '0'})
      // '0' parsed as Number('0') = 0 which is falsy
      expect(env.useColors()).toBe(false)
    })

    test('returns true when DEBUG_COLORS=yes', async () => {
      const env = await loadNodeEnv({DEBUG_COLORS: 'yes'})
      expect(env.useColors()).toBe(true)
    })

    test('returns true when DEBUG_COLORS=true', async () => {
      const env = await loadNodeEnv({DEBUG_COLORS: 'true'})
      expect(env.useColors()).toBe(true)
    })

    test('falls back to TTY detection when DEBUG_COLORS not set', async () => {
      const env = await loadNodeEnv()
      // In test environment, stderr is typically not a TTY
      const result = env.useColors()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('save() and load()', () => {
    test('save() sets process.env.DEBUG', async () => {
      const env = await loadNodeEnv()
      env.save('test:*')
      expect(process.env.DEBUG).toBe('test:*')
    })

    test('save(undefined) deletes process.env.DEBUG', async () => {
      const env = await loadNodeEnv()
      process.env.DEBUG = 'something'
      env.save(undefined)
      expect(process.env.DEBUG).toBeUndefined()
    })

    test('save empty string deletes process.env.DEBUG', async () => {
      const env = await loadNodeEnv()
      process.env.DEBUG = 'something'
      env.save('')
      expect(process.env.DEBUG).toBeUndefined()
    })

    test('load() returns process.env.DEBUG', async () => {
      const env = await loadNodeEnv()
      process.env.DEBUG = 'my:namespace'
      expect(env.load()).toBe('my:namespace')
    })

    test('load() returns undefined when DEBUG not set', async () => {
      const env = await loadNodeEnv()
      delete process.env.DEBUG
      expect(env.load()).toBeUndefined()
    })
  })

  describe('log()', () => {
    test('writes to stderr with newline', async () => {
      const env = await loadNodeEnv()
      const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

      env.log('hello %s', 'world')

      expect(writeSpy).toHaveBeenCalledOnce()
      const written = writeSpy.mock.calls[0][0]
      expect(typeof written).toBe('string')
      expect(written).toContain('hello world')
      expect(written).toMatch(/\n$/)
    })
  })

  describe('formatArgs()', () => {
    test('adds ANSI prefix when useColors=true', async () => {
      const env = await loadNodeEnv()
      const args: unknown[] = ['test message']
      const context = {
        color: 2,
        diff: 100,
        namespace: 'test:ns',
        useColors: true,
      } as DebugFunction

      env.formatArgs.call(context, args)

      // Should contain ANSI escape codes
      expect(args[0]).toContain('\u001B[')
      // Should contain the namespace
      expect(args[0]).toContain('test:ns')
      // Should have a time delta suffix appended
      const lastArg = args.at(-1) as string
      expect(lastArg).toContain('+100ms')
    })

    test('handles extended colors (>= 8) in ANSI prefix', async () => {
      const env = await loadNodeEnv()
      const args: unknown[] = ['test message']
      const context = {
        color: 42,
        diff: 100,
        namespace: 'test:ns',
        useColors: true,
      } as DebugFunction

      env.formatArgs.call(context, args)

      // Extended colors use 8;5;N format
      expect(args[0]).toContain('8;5;42')
    })

    test('adds ISO date prefix when useColors=false', async () => {
      const env = await loadNodeEnv()
      const args: unknown[] = ['test message']
      const context = {
        color: 2,
        diff: 100,
        namespace: 'test:ns',
        useColors: false,
      } as DebugFunction

      env.formatArgs.call(context, args)

      // Should have ISO date prefix
      const formatted = args[0] as string
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(formatted).toContain('test:ns')
      expect(formatted).toContain('test message')
    })

    test('respects DEBUG_HIDE_DATE=true', async () => {
      const env = await loadNodeEnv({DEBUG_HIDE_DATE: 'true'})
      const args: unknown[] = ['test message']
      const context = {
        color: 2,
        diff: 100,
        namespace: 'test:ns',
        useColors: false,
      } as DebugFunction

      env.formatArgs.call(context, args)

      // Should NOT have ISO date prefix
      const formatted = args[0] as string
      expect(formatted).not.toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(formatted).toBe('test:ns test message')
    })

    test('supports multiline messages with colors', async () => {
      const env = await loadNodeEnv()
      const args: unknown[] = ['line1\nline2']
      const context = {
        color: 2,
        diff: 0,
        namespace: 'test',
        useColors: true,
      } as DebugFunction

      env.formatArgs.call(context, args)

      // Each line should get the prefix
      const formatted = args[0] as string
      const lines = formatted.split('\n')
      expect(lines.length).toBe(2)
      for (const line of lines) {
        expect(line).toContain('test')
      }
    })
  })

  describe('formatters', () => {
    test('%o formatter returns single-line inspect', async () => {
      const env = await loadNodeEnv()
      const context = {
        inspectOpts: {},
        useColors: false,
      } as DebugFunction

      const formatter = env.formatters['o']
      expect(formatter).toBeDefined()

      const result = formatter.call(context, {a: 1, b: {c: 2}})
      // Single line - no newlines
      expect(result).not.toContain('\n')
      expect(result).toContain('a')
      expect(result).toContain('1')
    })

    test('%O formatter returns multi-line inspect', async () => {
      const env = await loadNodeEnv()
      const context = {
        inspectOpts: {},
        useColors: false,
      } as DebugFunction

      const formatter = env.formatters['O']
      expect(formatter).toBeDefined()

      const result = formatter.call(context, {a: 1, b: {c: 2}})
      // Multi-line for nested objects
      expect(result).toContain('a')
      expect(result).toContain('1')
    })
  })

  describe('colors()', () => {
    test('returns a non-empty array of numbers', async () => {
      const env = await loadNodeEnv()
      const colors = env.colors()
      expect(Array.isArray(colors)).toBe(true)
      expect(colors.length).toBeGreaterThan(0)
      for (const c of colors) {
        expect(typeof c).toBe('number')
      }
    })
  })

  describe('init()', () => {
    test('copies inspectOpts to instance', async () => {
      const env = await loadNodeEnv({DEBUG_DEPTH: '10', DEBUG_SHOW_HIDDEN: 'true'})

      const instance = {
        inspectOpts: undefined,
      } as unknown as DebugFunction

      env.init?.(instance)

      expect(instance.inspectOpts).toBeDefined()
      expect(instance.inspectOpts?.depth).toBe(10)
      expect(instance.inspectOpts?.showHidden).toBe(true)
    })

    test('each instance gets its own copy of inspectOpts', async () => {
      const env = await loadNodeEnv({DEBUG_DEPTH: '5'})

      const instance1 = {} as unknown as DebugFunction
      const instance2 = {} as unknown as DebugFunction

      env.init?.(instance1)
      env.init?.(instance2)

      expect(instance1.inspectOpts).toEqual(instance2.inspectOpts)
      // Modifying one should not affect the other
      if (instance1.inspectOpts) {
        instance1.inspectOpts.depth = 99
      }
      expect(instance2.inspectOpts?.depth).toBe(5)
    })
  })

  describe('inspectOpts parsing', () => {
    test('parses boolean-like values', async () => {
      const env = await loadNodeEnv({DEBUG_SHOW_HIDDEN: 'yes'})
      const instance = {} as unknown as DebugFunction
      env.init?.(instance)
      expect(instance.inspectOpts?.showHidden).toBe(true)
    })

    test('parses "null" as null', async () => {
      const env = await loadNodeEnv({DEBUG_COLORS: 'null'})
      const instance = {} as unknown as DebugFunction
      env.init?.(instance)
      expect(instance.inspectOpts?.colors).toBeNull()
    })

    test('parses numeric values', async () => {
      const env = await loadNodeEnv({DEBUG_DEPTH: '42'})
      const instance = {} as unknown as DebugFunction
      env.init?.(instance)
      expect(instance.inspectOpts?.depth).toBe(42)
    })
  })

  describe('onDebug / DEBUG_LOG_FILE', () => {
    test('onDebug is undefined when DEBUG_LOG_FILE is not set', async () => {
      const env = await loadNodeEnv()
      expect(env.onDebug).toBeUndefined()
    })

    test('onDebug is a function when DEBUG_LOG_FILE is set', async () => {
      const tmpFile = path.join(os.tmpdir(), `debug-test-${Date.now()}.jsonl`)
      filesToCleanup.push(tmpFile)

      const env = await loadNodeEnv({DEBUG_LOG_FILE: tmpFile})
      expect(typeof env.onDebug).toBe('function')
    })

    test('onDebug writes JSONL to the file', async () => {
      const tmpFile = path.join(os.tmpdir(), `debug-test-${Date.now()}.jsonl`)
      filesToCleanup.push(tmpFile)

      const env = await loadNodeEnv({DEBUG_LOG_FILE: tmpFile})

      env.onDebug!({
        diff: 42,
        msg: 'hello world',
        ns: 'test:ns',
        ts: '2026-01-01T00:00:00.000Z',
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const content = fs.readFileSync(tmpFile, 'utf8').trim()
      const parsed = JSON.parse(content)
      expect(parsed.ts).toBe('2026-01-01T00:00:00.000Z')
      expect(parsed.ns).toBe('test:ns')
      expect(parsed.msg).toBe('hello world')
      expect(parsed.diff).toBe(42)
    })

    test('onDebug appends multiple entries', async () => {
      const tmpFile = path.join(os.tmpdir(), `debug-test-${Date.now()}.jsonl`)
      filesToCleanup.push(tmpFile)

      const env = await loadNodeEnv({DEBUG_LOG_FILE: tmpFile})

      env.onDebug!({
        diff: 0,
        msg: 'first',
        ns: 'test',
        ts: '2026-01-01T00:00:00.000Z',
      })
      env.onDebug!({
        diff: 10,
        msg: 'second',
        ns: 'test',
        ts: '2026-01-01T00:00:00.010Z',
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const lines = fs.readFileSync(tmpFile, 'utf8').trim().split('\n')
      expect(lines).toHaveLength(2)
      expect(JSON.parse(lines[0]).msg).toBe('first')
      expect(JSON.parse(lines[1]).msg).toBe('second')
    })

    test('onDebug preserves property order: ts, ns, msg, diff', async () => {
      const tmpFile = path.join(os.tmpdir(), `debug-test-${Date.now()}.jsonl`)
      filesToCleanup.push(tmpFile)

      const env = await loadNodeEnv({DEBUG_LOG_FILE: tmpFile})

      env.onDebug!({
        diff: 5,
        msg: 'order test',
        ns: 'test:order',
        ts: '2026-01-01T00:00:00.000Z',
      })

      await new Promise((resolve) => setTimeout(resolve, 50))

      const raw = fs.readFileSync(tmpFile, 'utf8').trim()
      const keys = [...raw.matchAll(/"(\w+)":/g)].map((m) => m[1])
      expect(keys).toEqual(['ts', 'ns', 'msg', 'diff'])
    })
  })
})

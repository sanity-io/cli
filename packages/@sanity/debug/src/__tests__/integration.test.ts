import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {createDebug, disable, enable, enabled, formatters} from '../index.js'

describe('integration: Node entry point', () => {
  afterEach(() => {
    disable()
    vi.restoreAllMocks()
  })

  test('full lifecycle: enable, create, log, extend, disable', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    enable('test:*')
    expect(enabled('test:foo')).toBe(true)
    expect(enabled('other')).toBe(false)

    const debug = createDebug('test:app')
    expect(debug.namespace).toBe('test:app')
    expect(debug.enabled).toBe(true)
    expect(typeof debug.color).toBe('number')

    debug('hello %s', 'world')
    expect(writeSpy).toHaveBeenCalledOnce()
    const output = writeSpy.mock.calls[0][0] as string
    expect(output).toContain('test:app')
    expect(output).toContain('hello world')

    const child = debug.extend('sub')
    expect(child.namespace).toBe('test:app:sub')
    expect(child.enabled).toBe(true)

    child('child message')
    expect(writeSpy).toHaveBeenCalledTimes(2)

    const prev = disable()
    expect(prev).toContain('test:*')
    expect(debug.enabled).toBe(false)
    expect(child.enabled).toBe(false)
  })

  test('disabled instances produce no output', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const debug = createDebug('disabled:ns')
    debug('should not appear')
    expect(writeSpy).not.toHaveBeenCalled()
  })

  test('per-instance enable override', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const debug = createDebug('forced')
    debug.enabled = true
    debug('forced output')
    expect(writeSpy).toHaveBeenCalledOnce()
  })

  test('%o and %O formatters work', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    enable('test')

    const debug = createDebug('test')
    debug('obj: %o', {a: 1})
    expect(writeSpy).toHaveBeenCalledOnce()

    debug('obj: %O', {b: 2})
    expect(writeSpy).toHaveBeenCalledTimes(2)
  })

  test('Error objects are coerced to stack traces', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    enable('test')

    const debug = createDebug('test')
    const err = new Error('test error')
    debug(err)

    const output = writeSpy.mock.calls[0][0] as string
    expect(output).toContain('test error')
  })

  test('custom formatters can be added', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    enable('test')

    formatters.x = (v: unknown) => `<custom:${String(v)}>`

    const debug = createDebug('test')
    debug('val: %x', 42)

    const output = writeSpy.mock.calls[0][0] as string
    expect(output).toContain('<custom:42>')

    delete formatters.x
  })

  test('skip patterns work', () => {
    enable('*,-secret:*')
    expect(enabled('app')).toBe(true)
    expect(enabled('secret:key')).toBe(false)
  })
})

describe('integration: DEBUG_LOG_FILE', () => {
  const originalDebugLogFile = process.env.DEBUG_LOG_FILE
  const originalDebug = process.env.DEBUG
  const filesToCleanup: string[] = []

  afterEach(async () => {
    if (originalDebugLogFile === undefined) {
      delete process.env.DEBUG_LOG_FILE
    } else {
      process.env.DEBUG_LOG_FILE = originalDebugLogFile
    }
    if (originalDebug === undefined) {
      delete process.env.DEBUG
    } else {
      process.env.DEBUG = originalDebug
    }

    for (const f of filesToCleanup) {
      try {
        fs.unlinkSync(f)
      } catch {
        // ignore
      }
    }
    filesToCleanup.length = 0

    vi.restoreAllMocks()
    vi.resetModules()
  })

  test('debug calls write JSONL entries to the log file', async () => {
    const tmpFile = path.join(os.tmpdir(), `debug-integration-${Date.now()}.log`)
    filesToCleanup.push(tmpFile)

    process.env.DEBUG = 'test:*'
    process.env.DEBUG_LOG_FILE = tmpFile

    vi.resetModules()
    const {createDebugFactory} = await import('../createDebug.js')
    const {nodeEnv} = await import('../env/node.js')
    const {createDebug: createDebugFresh} = createDebugFactory(nodeEnv)

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)

    const debug = createDebugFresh('test:integration')
    debug('hello %s', 'world')
    debug('count: %d', 42)

    await new Promise((resolve) => setTimeout(resolve, 50))

    const content = fs.readFileSync(tmpFile, 'utf8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(2)

    const entry1 = JSON.parse(lines[0])
    expect(entry1.ns).toBe('test:integration')
    expect(entry1.msg).toBe('hello %s')
    expect(entry1.diff).toBe(0)
    expect(entry1.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const entry2 = JSON.parse(lines[1])
    expect(entry2.ns).toBe('test:integration')
    expect(entry2.msg).toBe('count: %d')
    expect(entry2.diff).toBeGreaterThanOrEqual(0)

    stderrSpy.mockRestore()
  })
})

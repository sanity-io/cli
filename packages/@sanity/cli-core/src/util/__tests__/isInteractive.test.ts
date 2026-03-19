import {afterEach, describe, expect, test, vi} from 'vitest'

import {isInteractive} from '../isInteractive.js'

describe('isInteractive', () => {
  const originalStdinIsTTY = process.stdin.isTTY
  const originalStdoutIsTTY = process.stdout.isTTY

  afterEach(() => {
    process.stdin.isTTY = originalStdinIsTTY
    process.stdout.isTTY = originalStdoutIsTTY
    vi.unstubAllEnvs()
  })

  test('returns true when stdin is a TTY and not in CI', () => {
    process.stdin.isTTY = true
    vi.stubEnv('CI', undefined)
    vi.stubEnv('TERM', undefined)

    expect(isInteractive()).toBe(true)
  })

  test('returns false when stdin is not a TTY', () => {
    process.stdin.isTTY = false
    vi.stubEnv('CI', undefined)
    vi.stubEnv('TERM', undefined)

    expect(isInteractive()).toBe(false)
  })

  test('returns false when TERM is dumb', () => {
    process.stdin.isTTY = true
    vi.stubEnv('TERM', 'dumb')
    vi.stubEnv('CI', undefined)

    expect(isInteractive()).toBe(false)
  })

  test('returns false when CI env var is set', () => {
    process.stdin.isTTY = true
    vi.stubEnv('TERM', undefined)
    vi.stubEnv('CI', 'true')

    expect(isInteractive()).toBe(false)
  })

  test('returns true when stdout is not a TTY but stdin is', () => {
    // This is the key scenario: `sanity build > output.log`
    // stdout is piped but stdin is still interactive
    process.stdin.isTTY = true
    process.stdout.isTTY = false
    vi.stubEnv('CI', undefined)
    vi.stubEnv('TERM', undefined)

    expect(isInteractive()).toBe(true)
  })

  test('returns true when skipCi is true even if CI env var is set', () => {
    process.stdin.isTTY = true
    vi.stubEnv('TERM', undefined)
    vi.stubEnv('CI', 'true')

    expect(isInteractive({skipCi: true})).toBe(true)
  })

  test('returns false when stdin is not a TTY even if stdout is', () => {
    // stdin is piped (e.g., `echo "input" | sanity command`)
    process.stdin.isTTY = false
    process.stdout.isTTY = true
    vi.stubEnv('CI', undefined)
    vi.stubEnv('TERM', undefined)

    expect(isInteractive()).toBe(false)
  })
})

import {afterEach, describe, expect, test, vi} from 'vitest'

import {createServerLifecycle, toDisplayHost} from '../serverOrchestration.js'

describe('toDisplayHost', () => {
  test.each(['0.0.0.0', '::', '[::]', undefined, ''])(
    'falls back to localhost for the non-routable bind address %s',
    (host) => {
      expect(toDisplayHost(host)).toBe('localhost')
    },
  )

  test('passes a routable host through unchanged', () => {
    expect(toDisplayHost('mydev.local')).toBe('mydev.local')
  })
})

describe('createServerLifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('runs closers in reverse (LIFO) on close', async () => {
    const order: number[] = []
    const {close, closers} = createServerLifecycle()
    closers.push(
      async () => void order.push(1),
      async () => void order.push(2),
    )

    await close()

    expect(order).toEqual([2, 1])
  })

  test('swallows a failing closer so the rest still run', async () => {
    const later = vi.fn().mockResolvedValue(undefined)
    const {close, closers} = createServerLifecycle()
    closers.push(later, async () => {
      throw new Error('boom')
    })

    await expect(close()).resolves.toBeUndefined()
    expect(later).toHaveBeenCalledTimes(1)
  })

  test('close is single-flight — a second call shares the same teardown', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined)
    const {close, closers} = createServerLifecycle()
    closers.push(dispose)

    await Promise.all([close(), close()])

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  test('installs signal handlers and removes them on close', async () => {
    const sigintBefore = process.listenerCount('SIGINT')
    const sigtermBefore = process.listenerCount('SIGTERM')

    const {close, installSignalHandlers} = createServerLifecycle()
    installSignalHandlers()

    expect(process.listenerCount('SIGINT')).toBe(sigintBefore + 1)
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore + 1)

    await close()

    expect(process.listenerCount('SIGINT')).toBe(sigintBefore)
    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore)
  })

  test('re-raises the signal once teardown settles so the default exit runs', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true)
    vi.useFakeTimers()

    const dispose = vi.fn().mockResolvedValue(undefined)
    const {closers, installSignalHandlers} = createServerLifecycle()
    closers.push(dispose)
    installSignalHandlers()

    const handler = process.listeners('SIGINT').at(-1) as (signal: NodeJS.Signals) => void
    handler('SIGINT')
    await vi.runAllTimersAsync()

    expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGINT')
    expect(dispose.mock.invocationCallOrder[0]).toBeLessThan(killSpy.mock.invocationCallOrder[0])
  })

  test('force-exits after the grace period when teardown hangs', async () => {
    const killSpy = vi.spyOn(process, 'kill').mockReturnValue(true)
    vi.useFakeTimers()

    const hangingClose = vi.fn(() => new Promise<void>(() => {}))
    const {closers, installSignalHandlers} = createServerLifecycle()
    closers.push(hangingClose)
    installSignalHandlers()

    const handler = process.listeners('SIGTERM').at(-1) as (signal: NodeJS.Signals) => void
    handler('SIGTERM')
    await vi.advanceTimersByTimeAsync(5000)

    expect(hangingClose).toHaveBeenCalled()
    expect(killSpy).toHaveBeenCalledWith(process.pid, 'SIGTERM')
  })
})

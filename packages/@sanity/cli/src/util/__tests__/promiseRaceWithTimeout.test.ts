import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {promiseRaceWithTimeout} from '../promiseRaceWithTimeout.js'

describe('#promiseRaceWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  test('returns promise result when it resolves before timeout', async () => {
    const promise = Promise.resolve('success')

    const resultPromise = promiseRaceWithTimeout(promise, 1000)
    await vi.runAllTimersAsync()

    const result = await resultPromise
    expect(result).toBe('success')
  })

  test('returns null when timeout occurs before promise resolves', async () => {
    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('late'), 2000)
    })

    const resultPromise = promiseRaceWithTimeout(promise, 1000)
    await vi.advanceTimersByTimeAsync(1000)

    const result = await resultPromise
    expect(result).toBeNull()
  })

  test('clears timeout when promise resolves first', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const promise = Promise.resolve('fast')

    await promiseRaceWithTimeout(promise, 1000)

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  test('clears timeout when timeout occurs', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('slow'), 2000)
    })

    const resultPromise = promiseRaceWithTimeout(promise, 1000)
    await vi.advanceTimersByTimeAsync(1000)
    await resultPromise

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  test('propagates promise rejection before timeout', async () => {
    const error = new Error('promise failed')
    const promise = Promise.reject(error)

    await expect(promiseRaceWithTimeout(promise, 1000)).rejects.toThrow('promise failed')
  })

  test('clears timeout when promise rejects', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const promise = Promise.reject(new Error('fail'))

    await promiseRaceWithTimeout(promise, 1000).catch(() => {})

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  test('handles zero timeout', async () => {
    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('delayed'), 100)
    })

    const resultPromise = promiseRaceWithTimeout(promise, 0)
    await vi.runAllTimersAsync()

    const result = await resultPromise
    expect(result).toBeNull()
  })
})

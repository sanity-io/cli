import {describe, expect, test} from 'vitest'

import {getCliExecutionContext, runWithCliExecutionContext} from '../executionContext.js'

describe('executionContext', () => {
  test('returns undefined outside a context', () => {
    expect(getCliExecutionContext()).toBeUndefined()
  })

  test('context is visible inside the async call graph and gone after', async () => {
    const context = {token: 'test-token'}
    await runWithCliExecutionContext(context, async () => {
      expect(getCliExecutionContext()).toBe(context)
      await Promise.resolve()
      expect(getCliExecutionContext()).toBe(context)
    })
    expect(getCliExecutionContext()).toBeUndefined()
  })

  test('concurrent contexts are isolated from each other', async () => {
    const seen: Record<string, string | undefined> = {}
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    await Promise.all([
      runWithCliExecutionContext({token: 'token-a'}, async () => {
        await sleep(15)
        seen.a = getCliExecutionContext()?.token
      }),
      runWithCliExecutionContext({token: 'token-b'}, async () => {
        await sleep(5)
        seen.b = getCliExecutionContext()?.token
      }),
    ])

    expect(seen).toEqual({a: 'token-a', b: 'token-b'})
  })

  test('makes isInteractive report non-interactive', async () => {
    const {isInteractive} = await import('../util/isInteractive.js')
    await runWithCliExecutionContext({}, () => {
      expect(isInteractive()).toBe(false)
    })
  })

  test('returns the wrapped function result', () => {
    const result = runWithCliExecutionContext({}, () => 42)
    expect(result).toBe(42)
  })
})

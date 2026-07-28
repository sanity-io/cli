import {describe, expect, test} from 'vitest'

import {getCliExecutionContext, runWithCliExecutionContext} from '../executionContext.js'

describe('executionContext', () => {
  test('returns undefined outside a context', () => {
    expect(getCliExecutionContext()).toBeUndefined()
  })

  test('context is visible inside the async call graph and gone after', async () => {
    const context = {sanityEnv: 'staging', token: 'test-token'} as const
    await runWithCliExecutionContext(context, async () => {
      expect(getCliExecutionContext()).toBe(context)
      await Promise.resolve()
      expect(getCliExecutionContext()).toBe(context)
    })
    expect(getCliExecutionContext()).toBeUndefined()
  })

  test('concurrent contexts are isolated from each other', async () => {
    const seen: Record<string, {sanityEnv?: string; token?: string}> = {}
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    await Promise.all([
      runWithCliExecutionContext({sanityEnv: 'production', token: 'token-a'}, async () => {
        await sleep(15)
        seen.a = {...getCliExecutionContext()}
      }),
      runWithCliExecutionContext({sanityEnv: 'staging', token: 'token-b'}, async () => {
        await sleep(5)
        seen.b = {...getCliExecutionContext()}
      }),
    ])

    expect(seen).toEqual({
      a: {sanityEnv: 'production', token: 'token-a'},
      b: {sanityEnv: 'staging', token: 'token-b'},
    })
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

import {type NavigationLocation} from '@sanity/sdk/dashboard'
import {describe, expect, expectTypeOf, test} from 'vitest'

import {WEB_WORKER_CONTRACT_VERSION, WebWorkerDeclarationSchema} from '../contract.js'
import {unstable_defineService} from '../webWorker.js'

const run = () => {}

describe('unstable_defineService', () => {
  test('tags the callback with its type and the contract version', () => {
    const service = unstable_defineService('worker', run)
    expect(service.type).toBe('worker')
    expect(service.version).toBe(WEB_WORKER_CONTRACT_VERSION)
    // The callback passes through by reference — the helper is pure identity.
    expect(service.run).toBe(run)
  })

  // Type-level only: the callback body never runs.
  test('types the bus for reading state and responding to events', () => {
    unstable_defineService('worker', ({bus}) => {
      const controller = new AbortController()
      expectTypeOf(
        bus.query('navigation.location'),
      ).resolves.toEqualTypeOf<NavigationLocation | null>()
      bus.subscribe(
        'navigation.location',
        (value) => expectTypeOf(value).toEqualTypeOf<NavigationLocation | null>(),
        {signal: controller.signal},
      )
      bus.subscribe('auth.token.refresh', (message) => {
        expectTypeOf(message.type).toEqualTypeOf<'auth.token.refresh'>()
        expectTypeOf(message.reply).parameter(0).toEqualTypeOf<string>()
        message.reply('token')
      })
      // @ts-expect-error an event subscription needs a handler
      bus.subscribe('auth.token.refresh')
      // @ts-expect-error a state subscription needs a handler
      bus.subscribe('navigation.location')
      return () => controller.abort()
    })
  })
})

describe('WebWorkerDeclarationSchema', () => {
  test('accepts a worker declaration', () => {
    const parsed = WebWorkerDeclarationSchema.parse({
      name: 'unread',
      src: './src/worker.ts',
      title: 'Unread',
      type: 'worker',
    })
    expect(parsed.type).toBe('worker')
  })

  test('requires a title, which Brett stores on the interface', () => {
    const result = WebWorkerDeclarationSchema.safeParse({
      name: 'unread',
      src: './src/worker.ts',
      type: 'worker',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Web worker `title` is required')
  })

  test('rejects a name with illegal characters', () => {
    expect(
      WebWorkerDeclarationSchema.safeParse({
        name: 'un read',
        src: './src/worker.ts',
        title: 'un read',
        type: 'worker',
      }).success,
    ).toBe(false)
  })

  test('rejects an unknown web worker type', () => {
    expect(
      WebWorkerDeclarationSchema.safeParse({name: 'unread', src: './src/worker.ts', type: 'cron'})
        .success,
    ).toBe(false)
  })
})

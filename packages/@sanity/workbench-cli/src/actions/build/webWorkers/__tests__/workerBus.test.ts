import {afterEach, describe, expect, test, vi} from 'vitest'

import {createWorkerBus} from '../workerBus.js'

type Posted = Record<string, unknown> & {id: number; kind: string}

// `self` stands in for the worker global and records what the client posts.
// In a worker the generated entry is the only `message` listener and hands bus
// messages to `receive`; here the test plays the entry and calls it directly.
function start() {
  const posted: Posted[] = []
  // structuredClone proves every message survives a real postMessage.
  vi.stubGlobal('self', {postMessage: (message: Posted) => posted.push(structuredClone(message))})
  const {bus: client, close, receive} = createWorkerBus()
  const bus = (kind: string) => posted.filter((message) => message.kind === kind)
  return {bus, client, close, posted, receive}
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createWorkerBus', () => {
  test('resolves a query with the value the host replies', async () => {
    const {bus, client, receive} = start()
    const location = client.query('navigation.location', {timeout: null})
    void client.query('navigation.location')
    const [request, withoutTimeout] = bus('workbench.bus.query')
    expect(request).toStrictEqual({
      id: expect.any(Number),
      kind: 'workbench.bus.query',
      timeout: null,
      topic: 'navigation.location',
    })
    // An omitted timeout stays absent so the host applies its default.
    expect(withoutTimeout).toStrictEqual({
      id: expect.any(Number),
      kind: 'workbench.bus.query',
      topic: 'navigation.location',
    })

    receive({id: request.id, kind: 'workbench.bus.reply', ok: true, value: {url: '/apps'}})
    await expect(location).resolves.toEqual({url: '/apps'})
  })

  test('rejects a refused request with the MessageBusError code the host sent', async () => {
    const {bus, client, receive} = start()
    const location = client.query('navigation.location')
    const [request] = bus('workbench.bus.query')

    receive({
      error: {code: 'REFUSED', message: 'not for workers'},
      id: request.id,
      kind: 'workbench.bus.reply',
      ok: false,
    })
    await expect(location).rejects.toBeInstanceOf(Error)
    await expect(location).rejects.toMatchObject({
      code: 'REFUSED',
      docsUrl: undefined,
      fix: undefined,
      message: 'not for workers',
      name: 'MessageBusError',
    })
  })

  test("passes on a refusal's fix and docs link", async () => {
    const {bus, client, receive} = start()
    const update = client.emit('navigation.location.update', {url: '/a'})
    const [request] = bus('workbench.bus.emit')

    receive({
      error: {
        code: 'NO_RESPONDER',
        docsUrl: 'https://www.sanity.io/docs/dashboard-beta/dash1003',
        fix: 'Start the worker before posting to it.',
        message: 'Worker "sync" is not running.',
      },
      id: request.id,
      kind: 'workbench.bus.reply',
      ok: false,
    })
    await expect(update).rejects.toMatchObject({
      code: 'NO_RESPONDER',
      docsUrl: 'https://www.sanity.io/docs/dashboard-beta/dash1003',
      fix: 'Start the worker before posting to it.',
      message: 'Worker "sync" is not running.',
    })
  })

  test('times out a request the host never answers', async () => {
    const {client} = start()
    await expect(client.query('navigation.location', {timeout: 1})).rejects.toMatchObject({
      code: 'TIMEOUT',
      name: 'MessageBusError',
    })
  })

  test('times out after 5 seconds by default and never when the timeout is null', async () => {
    const {client} = start()
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    try {
      const settled: string[] = []
      const track = (name: string, request: Promise<unknown>) =>
        request.catch((error: {code: string}) => settled.push(`${name}:${error.code}`))
      void track('default', client.query('navigation.location'))
      void track('null', client.query('navigation.location', {timeout: null}))

      await vi.advanceTimersByTimeAsync(4999)
      expect(settled).toEqual([])
      await vi.advanceTimersByTimeAsync(1)
      expect(settled).toEqual(['default:TIMEOUT'])
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
      expect(settled).toEqual(['default:TIMEOUT'])
    } finally {
      vi.useRealTimers()
    }
  })

  test('posts an emit at once and holds an error reply until it is awaited', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const {bus, client, receive} = start()
      const result = client.emit('navigation.location.update', {url: '/apps'}, {timeout: 50})
      const [request] = bus('workbench.bus.emit')
      expect(request).toStrictEqual({
        id: expect.any(Number),
        kind: 'workbench.bus.emit',
        payload: {url: '/apps'},
        timeout: 50,
        topic: 'navigation.location.update',
      })

      receive({
        error: {code: 'NO_RESPONDER', message: 'NO_RESPONDER'},
        id: request.id,
        kind: 'workbench.bus.reply',
        ok: false,
      })
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(unhandled).not.toHaveBeenCalled()

      await expect(result).rejects.toMatchObject({code: 'NO_RESPONDER'})
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  test('resolves an awaited emit with the reply value', async () => {
    const {bus, client, receive} = start()
    const result = client.emit('navigation.location.update', {url: '/apps'})
    receive({
      id: bus('workbench.bus.emit')[0].id,
      kind: 'workbench.bus.reply',
      ok: true,
      value: {ok: true},
    })
    await expect(result).resolves.toEqual({ok: true})
  })

  test('aborting a request tells the host and rejects ABORTED', async () => {
    const {bus, client} = start()
    const controller = new AbortController()
    const location = client.query('navigation.location', {signal: controller.signal})
    const [request] = bus('workbench.bus.query')

    controller.abort()
    expect(bus('workbench.bus.abort')).toEqual([{id: request.id, kind: 'workbench.bus.abort'}])
    await expect(location).rejects.toMatchObject({code: 'ABORTED'})
  })

  test('runs a subscription handler for each value until its signal aborts', () => {
    const {bus, client, receive} = start()
    const handler = vi.fn()
    const controller = new AbortController()
    client.subscribe('navigation.location', handler, {signal: controller.signal})
    const [request] = bus('workbench.bus.subscribe')
    expect(request).toStrictEqual({
      id: expect.any(Number),
      kind: 'workbench.bus.subscribe',
      topic: 'navigation.location',
    })

    receive({id: request.id, kind: 'workbench.bus.value', value: {url: '/a'}})
    receive({id: request.id, kind: 'workbench.bus.value', value: {url: '/b'}})
    controller.abort()
    receive({id: request.id, kind: 'workbench.bus.value', value: {url: '/c'}})

    expect(handler.mock.calls).toEqual([[{url: '/a'}], [{url: '/b'}]])
    expect(bus('workbench.bus.abort')).toEqual([{id: request.id, kind: 'workbench.bus.abort'}])
  })

  // The Dashboard prints the refusal itself, so printing it here too would show it twice.
  test('ends a subscription the host refuses without printing it', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const {bus, client, receive} = start()
    const handler = vi.fn()
    client.subscribe('navigation.location', handler)
    const [request] = bus('workbench.bus.subscribe')

    receive({
      error: {code: 'REFUSED', message: 'no'},
      id: request.id,
      kind: 'workbench.bus.reply',
      ok: false,
    })
    receive({id: request.id, kind: 'workbench.bus.value', value: {url: '/a'}})

    expect(handler).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  test('answers each event message once with the reply its handler gives', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const {bus, client, receive} = start()
    const handler = vi.fn((message) => {
      message.reply(`token for ${message.payload}`)
      message.reply('again')
    })
    client.subscribe('auth.token.refresh', handler)
    const [request] = bus('workbench.bus.subscribe')
    expect(request).toStrictEqual({
      id: expect.any(Number),
      kind: 'workbench.bus.subscribe',
      topic: 'auth.token.refresh',
    })

    const meta = {appId: 'app', timestamp: 1}
    receive({
      id: request.id,
      kind: 'workbench.bus.message',
      messageId: 7,
      meta,
      payload: 'view',
      type: 'auth.token.refresh',
    })

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({meta, payload: 'view', type: 'auth.token.refresh'}),
    )
    expect(bus('workbench.bus.answer')).toEqual([
      {kind: 'workbench.bus.answer', messageId: 7, ok: true, value: 'token for view'},
    ])
    expect(warn).toHaveBeenCalledOnce()
  })

  test.each([
    {
      code: 'REFUSED',
      handler: (message: {reject: (reason?: string) => void}) => message.reject('no feed yet'),
      message: 'no feed yet',
      name: 'refuses',
    },
    {
      code: 'HANDLER_THREW',
      handler: () => {
        throw new Error('boom')
      },
      message: 'HANDLER_THREW',
      name: 'throws',
    },
    {
      code: 'HANDLER_THREW',
      handler: () => Promise.reject(new Error('boom')),
      message: 'HANDLER_THREW',
      name: 'returns a rejected promise',
    },
  ])('refuses the message with $code when the handler $name', async ({code, handler, message}) => {
    const {bus, client, receive} = start()
    client.subscribe('auth.token.refresh', handler)
    const [request] = bus('workbench.bus.subscribe')

    receive({
      id: request.id,
      kind: 'workbench.bus.message',
      messageId: 1,
      meta: {appId: 'app', timestamp: 1},
      payload: undefined,
      type: 'auth.token.refresh',
    })
    await Promise.resolve()

    expect(bus('workbench.bus.answer')).toEqual([
      {error: {code, message}, kind: 'workbench.bus.answer', messageId: 1, ok: false},
    ])
  })

  test('aborts a message signal when the sender stops waiting or the bus closes, and answers neither', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const {bus, client, close, receive} = start()
    const messages: {reply: (value: string) => void; signal: AbortSignal}[] = []
    client.subscribe('auth.token.refresh', (message) => {
      messages.push(message)
    })
    const [request] = bus('workbench.bus.subscribe')
    for (const messageId of [1, 2]) {
      receive({
        id: request.id,
        kind: 'workbench.bus.message',
        messageId,
        meta: {appId: 'app', timestamp: 1},
        payload: undefined,
        type: 'auth.token.refresh',
      })
    }
    const [cancelled, open] = messages

    receive({kind: 'workbench.bus.cancel', messageId: 1})
    expect(cancelled.signal.aborted).toBe(true)
    expect(open.signal.aborted).toBe(false)
    close()
    expect(open.signal.aborted).toBe(true)

    cancelled.reply('late')
    open.reply('late')
    expect(bus('workbench.bus.answer')).toEqual([])
  })

  test('close ends subscriptions and pending requests, and later calls fail ABORTED', async () => {
    const {bus, client, close, posted, receive} = start()
    const handler = vi.fn()
    client.subscribe('navigation.location', handler)
    const pending = client.query('navigation.location')
    const [subscription] = bus('workbench.bus.subscribe')
    const postedBefore = posted.length

    close()
    receive({id: subscription.id, kind: 'workbench.bus.value', value: {url: '/a'}})

    await expect(pending).rejects.toMatchObject({code: 'ABORTED'})
    await expect(client.query('navigation.location')).rejects.toMatchObject({code: 'ABORTED'})
    await expect(client.emit('navigation.location.update', {url: '/a'})).rejects.toMatchObject({
      code: 'ABORTED',
    })
    expect(() => client.subscribe('navigation.location', handler)).toThrow(
      expect.objectContaining({code: 'ABORTED'}),
    )
    expect(handler).not.toHaveBeenCalled()
    // The host has disconnected, so nothing more goes on the wire.
    expect(posted).toHaveLength(postedBefore)
  })
})

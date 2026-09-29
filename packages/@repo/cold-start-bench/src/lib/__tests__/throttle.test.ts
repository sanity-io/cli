import {createConnection, createServer, type Server} from 'node:net'

import {afterEach, describe, expect, test} from 'vitest'

import {type Link, modelDownloadMs, scheduleChunk, startThrottleProxy, type ThrottleProxy} from '../throttle.ts'

describe('scheduleChunk', () => {
  const base = {mbps: 8, oneWayMs: 20, previousDelivery: 0}

  test('an idle link delivers after send time plus one-way latency', () => {
    const link: Link = {busyUntil: 0}
    // 1000 bytes at 8 Mbit/s = 1 ms on the wire
    expect(scheduleChunk({...base, bytes: 1000, link, now: 100})).toBe(121)
    expect(link.busyUntil).toBe(101)
  })

  test('chunks queue behind each other on a shared link', () => {
    const link: Link = {busyUntil: 0}
    scheduleChunk({...base, bytes: 10_000, link, now: 0})
    // Second connection has to wait for the first 10 ms of sending
    expect(scheduleChunk({...base, bytes: 1000, link, now: 1})).toBe(31)
  })

  test('keeps delivery order on one connection', () => {
    const link: Link = {busyUntil: 0}
    expect(scheduleChunk({...base, bytes: 1, link, now: 0, previousDelivery: 500})).toBe(500)
  })
})

async function roundTrip(port: number, payload: Buffer): Promise<{echoed: Buffer; elapsed: number;}> {
  const started = performance.now()
  return new Promise((resolve, reject) => {
    const socket = createConnection({host: '127.0.0.1', port})
    const received: Buffer[] = []
    let length = 0
    socket.on('data', (chunk) => {
      received.push(chunk)
      length += chunk.length
      if (length >= payload.length) {
        socket.end()
        resolve({echoed: Buffer.concat(received), elapsed: performance.now() - started})
      }
    })
    socket.on('error', reject)
    socket.write(payload)
  })
}

describe('startThrottleProxy', () => {
  let echo: Server
  let proxy: ThrottleProxy

  afterEach(async () => {
    await proxy?.close()
    await new Promise((resolve) => echo?.close(resolve))
  })

  async function startEcho(): Promise<number> {
    echo = createServer((socket) => socket.pipe(socket))
    await new Promise<void>((resolve) => echo.listen(0, '127.0.0.1', resolve))
    const address = echo.address()
    if (!address || typeof address === 'string') throw new Error('no port')
    return address.port
  }

  test('passes bytes through, adds latency, and counts traffic', async () => {
    const targetPort = await startEcho()
    proxy = await startThrottleProxy({
      profile: {downMbps: 1000, rttMs: 100, upMbps: 1000},
      targetPort,
    })

    const payload = Buffer.from('hello registry')
    const {echoed, elapsed} = await roundTrip(proxy.port, payload)

    expect(echoed.toString()).toBe('hello registry')
    expect(elapsed).toBeGreaterThanOrEqual(95)
    expect(proxy.resetStats()).toEqual({bytesDown: 14, bytesUp: 14, connections: 1})
    expect(proxy.resetStats()).toEqual({bytesDown: 0, bytesUp: 0, connections: 0})
  })

  test('limits bandwidth', async () => {
    const targetPort = await startEcho()
    proxy = await startThrottleProxy({profile: {downMbps: 8, rttMs: 0, upMbps: 1000}, targetPort})

    // 100 KB at 8 Mbit/s = 100 ms
    const {elapsed} = await roundTrip(proxy.port, Buffer.alloc(100_000, 1))
    expect(elapsed).toBeGreaterThanOrEqual(90)
  })

  test('pauses a fast sender and still delivers everything', async () => {
    const targetPort = await startEcho()
    proxy = await startThrottleProxy({profile: {downMbps: 200, rttMs: 0, upMbps: 1000}, targetPort})

    const payload = Buffer.alloc(3 * 1024 * 1024, 7)
    const {echoed} = await roundTrip(proxy.port, payload)
    expect(echoed.equals(payload)).toBe(true)
  })

  test('closes the client when the target is unreachable', async () => {
    const targetPort = await startEcho()
    await new Promise((resolve) => echo.close(resolve))
    proxy = await startThrottleProxy({profile: {downMbps: 1, rttMs: 0, upMbps: 1}, targetPort})

    const closed = await new Promise<boolean>((resolve) => {
      const socket = createConnection({host: '127.0.0.1', port: proxy.port})
      socket.on('close', () => resolve(true))
      socket.on('error', () => {})
    })
    expect(closed).toBe(true)
  })

  test('delivers every byte before closing, when the target ends right after writing', async () => {
    echo = createServer((socket) => {
      for (let i = 0; i < 300; i++) socket.write(Buffer.alloc(997, i % 256))
      socket.end()
    })
    await new Promise<void>((resolve) => echo.listen(0, '127.0.0.1', resolve))
    const address = echo.address()
    if (!address || typeof address === 'string') throw new Error('no port')
    proxy = await startThrottleProxy({
      profile: {downMbps: 37, rttMs: 7, upMbps: 10},
      targetPort: address.port,
    })

    for (let attempt = 0; attempt < 5; attempt++) {
      const received = await new Promise<number>((resolve, reject) => {
        let length = 0
        const socket = createConnection({host: '127.0.0.1', port: proxy.port})
        socket.on('data', (chunk) => (length += chunk.length))
        socket.on('end', () => resolve(length))
        socket.on('error', reject)
      })
      expect(received).toBe(300 * 997)
    }
  })

  test('keeps bytes in order when chunks arrive at irregular times', async () => {
    const payload = Buffer.alloc(400_000)
    for (let i = 0; i < payload.length; i++) payload[i] = (i * 7 + (i >> 8)) % 256
    echo = createServer(async (socket) => {
      let offset = 0
      let size = 1
      while (offset < payload.length) {
        size = (size * 31 + 17) % 9000 || 1
        socket.write(payload.subarray(offset, offset + size))
        offset += size
        // Spread writes over several event-loop turns and timer ticks
        await new Promise((resolve) => (size % 3 === 0 ? setTimeout(resolve, 1) : setImmediate(resolve)))
      }
      socket.end()
    })
    await new Promise<void>((resolve) => echo.listen(0, '127.0.0.1', resolve))
    const address = echo.address()
    if (!address || typeof address === 'string') throw new Error('no port')
    proxy = await startThrottleProxy({profile: {downMbps: 50, rttMs: 40, upMbps: 10}, targetPort: address.port})

    const received = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      const socket = createConnection({host: '127.0.0.1', port: proxy.port})
      socket.on('data', (chunk) => chunks.push(chunk))
      socket.on('end', () => resolve(Buffer.concat(chunks)))
      socket.on('error', reject)
    })
    expect(received.length).toBe(payload.length)
    expect(received.equals(payload)).toBe(true)
  })

  test('passes traffic at full speed while throttling is off', async () => {
    const targetPort = await startEcho()
    proxy = await startThrottleProxy({profile: {downMbps: 1, rttMs: 500, upMbps: 1}, targetPort})
    proxy.setThrottled(false)
    const {echoed, elapsed} = await roundTrip(proxy.port, Buffer.alloc(50_000, 3))
    expect(echoed.length).toBe(50_000)
    // Throttled, this would take over a second
    expect(elapsed).toBeLessThan(400)
  })
})

describe('modelDownloadMs', () => {
  test('bandwidth plus round trips spread over 15 connections', () => {
    // 50 Mbit/s: 1 MB takes 160 ms; 150 requests × 40 ms / 15 = 400 ms
    expect(
      modelDownloadMs({bytesDown: 1_000_000, profile: {downMbps: 50, rttMs: 40, upMbps: 10}, requests: 150}),
    ).toBe(560)
  })
})

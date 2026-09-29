import {createConnection, createServer, type Server, type Socket} from 'node:net'

export interface NetworkProfile {
  /** Download bandwidth shared by all connections, in megabits per second */
  downMbps: number
  /** Round-trip time added to every request, in milliseconds */
  rttMs: number
  /** Upload bandwidth shared by all connections, in megabits per second */
  upMbps: number
}

/**
 * One direction of the simulated link. Every connection shares it, the way
 * parallel downloads share a home connection.
 */
export interface Link {
  /** Time the link finishes sending everything queued so far */
  busyUntil: number
}

/**
 * When a chunk of `bytes` written at `now` reaches the other side: it waits for
 * the link to be free, takes `bytes / bandwidth` to send, then travels for half
 * the round trip. `previousDelivery` keeps chunks on one connection in order.
 */
export function scheduleChunk(options: {
  bytes: number
  link: Link
  mbps: number
  now: number
  oneWayMs: number
  previousDelivery: number
}): number {
  const {bytes, link, mbps, now, oneWayMs, previousDelivery} = options
  const start = Math.max(now, link.busyUntil)
  const sendMs = (bytes * 8) / (mbps * 1000)
  link.busyUntil = start + sendMs
  return Math.max(previousDelivery, link.busyUntil + oneWayMs)
}

interface ThrottleStats {
  bytesDown: number
  bytesUp: number
  connections: number
}

export interface ThrottleProxy {
  close(): Promise<void>
  port: number
  /** Returns the counters since the last reset and zeroes them */
  resetStats(): ThrottleStats
  /** Off passes traffic through at full speed, e.g. while filling the registry */
  setThrottled(throttled: boolean): void
}

// Stop reading from a socket while this much is waiting to be delivered, so a
// fast local registry can't pile a whole tarball into memory.
const HIGH_WATER_BYTES = 1024 * 1024

/**
 * A TCP proxy that makes a local registry behave like one on the other end of
 * a real network connection: shared bandwidth in each direction plus latency.
 */
export async function startThrottleProxy(options: {
  profile: NetworkProfile
  targetPort: number
}): Promise<ThrottleProxy> {
  const {profile, targetPort} = options
  const down: Link = {busyUntil: 0}
  const up: Link = {busyUntil: 0}
  const oneWayMs = profile.rttMs / 2
  let throttled = true
  let stats: ThrottleStats = {bytesDown: 0, bytesUp: 0, connections: 0}
  const sockets = new Set<Socket>()

  /**
   * Chunks go into one queue per direction and a single timer drains it, so
   * they are written in order. A timer per chunk would not keep that order:
   * Node measures expiry from its cached loop clock, so a later chunk with a
   * shorter delay can fire first and corrupt the stream.
   */
  function pipe(from: Socket, to: Socket, link: Link, mbps: number, count: (n: number) => void) {
    // `null` marks the end of the stream
    const queue: {at: number; chunk: Buffer | null}[] = []
    let previousDelivery = 0
    let pending = 0
    let timer: NodeJS.Timeout | undefined

    function drain() {
      timer = undefined
      const now = performance.now()
      while (queue.length > 0 && queue[0].at <= now) {
        const {chunk} = queue.shift()!
        if (chunk === null) {
          to.end()
          continue
        }
        pending -= chunk.length
        if (!to.destroyed) to.write(chunk)
      }
      if (pending <= HIGH_WATER_BYTES && from.isPaused()) from.resume()
      if (queue.length > 0) timer = setTimeout(drain, Math.max(0, queue[0].at - performance.now()))
    }

    function enqueue(at: number, chunk: Buffer | null) {
      queue.push({at, chunk})
      timer ??= setTimeout(drain, Math.max(0, at - performance.now()))
    }

    from.on('data', (chunk: Buffer) => {
      count(chunk.length)
      const now = performance.now()
      previousDelivery = throttled
        ? scheduleChunk({bytes: chunk.length, link, mbps, now, oneWayMs, previousDelivery})
        : Math.max(now, previousDelivery)
      pending += chunk.length
      if (pending > HIGH_WATER_BYTES) from.pause()
      enqueue(previousDelivery, chunk)
    })
    from.on('end', () => enqueue(previousDelivery, null))
    // Once the receiving side is gone there's nowhere to deliver to
    to.on('close', () => {
      clearTimeout(timer)
      queue.length = 0
    })
  }

  const server: Server = createServer((client) => {
    stats.connections++
    const target = createConnection({host: '127.0.0.1', port: targetPort})
    sockets.add(client).add(target)
    for (const socket of [client, target]) {
      socket.on('close', () => sockets.delete(socket))
      socket.on('error', () => {
        client.destroy()
        target.destroy()
      })
    }
    pipe(client, target, up, profile.upMbps, (n) => (stats.bytesUp += n))
    pipe(target, client, down, profile.downMbps, (n) => (stats.bytesDown += n))
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Throttle proxy has no port')

  return {
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => resolve())
      }),
    port: address.port,
    resetStats() {
      const current = stats
      stats = {bytesDown: 0, bytesUp: 0, connections: 0}
      return current
    },
    setThrottled(value) {
      throttled = value
    },
  }
}

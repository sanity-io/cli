import {once} from 'node:events'
import {createServer, get, type IncomingMessage, request} from 'node:http'
import {connect, type Socket} from 'node:net'
import {pipeline} from 'node:stream'

import {toDisplayHost} from '../../util/serverOrchestration.js'
import {
  type DevServerManifest,
  getRegisteredServers,
  readWorkbenchLock,
  watchRegistry,
} from './registry.js'

export async function startPortlessProxy(options: {organizationId: string; port: number}) {
  const {organizationId, port} = options
  const domain = new URL(`http://sanity.localhost:${port}`).host
  const shellUrl = new URL(`http://${organizationId.toLowerCase()}.${domain}`)
  const routes = new Map<string | undefined, Pick<DevServerManifest, 'host' | 'port'>>()

  const readRoutes = (servers: DevServerManifest[]) => {
    routes.clear()

    const organizationIds = new Set([
      organizationId,
      ...servers.flatMap((entry) => entry.organizationId ?? []),
    ])

    for (const id of organizationIds) {
      const shell = readWorkbenchLock(id)

      if (shell) {
        routes.set(`${id.toLowerCase()}.${domain}`, {
          host: toDisplayHost(shell.host),
          port: shell.port,
        })
      }
    }

    for (const entry of servers) {
      if (entry.slug && entry.organizationId) {
        routes.set(`${entry.slug}.${entry.organizationId.toLowerCase()}.${domain}`, {
          host: toDisplayHost(entry.host),
          port: entry.port,
        })
      }
    }
  }

  const server = createServer((req, res) => {
    if (!routes.has(req.headers.host)) readRoutes(getRegisteredServers())

    const target = routes.get(req.headers.host)

    if (!target) {
      res.writeHead(404, {'x-sanity-portless': 'true'}).end()
      return
    }

    const upstream = request(
      {...target, headers: req.headers, method: req.method, path: req.url},
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
        upstreamRes.pipe(res)
      },
    )
    upstream.on('error', () => (res.headersSent ? res.destroy() : res.writeHead(502).end()))
    res.on('close', () => {
      if (!res.writableFinished) upstream.destroy()
    })
    req.pipe(upstream)
  })

  server.on('upgrade', (req, socket, head) => {
    if (!routes.has(req.headers.host)) readRoutes(getRegisteredServers())

    const target = routes.get(req.headers.host)

    if (!target) {
      socket.destroy()
      return
    }

    const upstream = connect(target.port, target.host)
    const headers = req.rawHeaders.map((value, i) => (i % 2 ? `${value}\r\n` : `${value}: `))
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers.join('')}\r\n`)
    upstream.write(head)
    pipeline(socket, upstream, socket, () => {})
  })

  const sockets = new Set<Socket>()
  server.on('connection', (socket) => {
    if (!socket.remoteAddress?.match(/^(::1$|(::ffff:)?127\.)/)) {
      socket.destroy()
      return
    }

    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
  })

  let watcher: ReturnType<typeof watchRegistry> | undefined
  let takeover: ReturnType<typeof setInterval> | undefined
  server.on('listening', () => {
    clearInterval(takeover)
    watcher = watchRegistry(readRoutes)
    readRoutes(getRegisteredServers())
  })

  try {
    server.listen(port)
    await once(server, 'listening')
  } catch (err) {
    const owner = await new Promise<IncomingMessage>((resolve, reject) => {
      get(
        {headers: {host: domain}, host: '127.0.0.1', port, signal: AbortSignal.timeout(1000)},
        resolve,
      ).on('error', reject)
    }).catch(() => {
      throw err
    })
    owner.resume()

    if (owner.headers['x-sanity-portless'] !== 'true') throw err

    server.on('error', () => {})
    takeover = setInterval(() => server.listening || server.listen(port), 1000)
  }

  return {
    close: async () => {
      clearInterval(takeover)
      watcher?.close()
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    },
    route: (servers: DevServerManifest[]) =>
      servers.map((entry) =>
        entry.slug ? {...entry, host: `${entry.slug}.${shellUrl.hostname}`, port} : entry,
      ),
    url: shellUrl.origin,
  }
}

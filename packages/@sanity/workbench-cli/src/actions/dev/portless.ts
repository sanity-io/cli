import {once} from 'node:events'
import {createServer, get, request} from 'node:http'
import {connect, type Socket} from 'node:net'
import {pipeline} from 'node:stream'

import {type Output} from '@sanity/cli-core'

import {toDisplayHost} from '../../util/serverOrchestration.js'
import {
  type DevServerManifest,
  getRegisteredServers,
  readWorkbenchLock,
  watchRegistry,
} from './registry.js'

export async function startPortlessProxy(options: {
  organizationId: string
  output: Output
  port: number
  shellPort: number
}) {
  const {organizationId, output, port, shellPort} = options
  const domain = new URL(`http://sanity.localhost:${port}`).host
  const shellHostname = `${organizationId.toLowerCase()}.sanity.localhost`
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
  let proxied = true
  server.on('listening', () => {
    clearInterval(takeover)
    watcher = watchRegistry(readRoutes)
    readRoutes(getRegisteredServers())
  })

  try {
    server.listen(port)
    await once(server, 'listening')
  } catch (err) {
    const isSanityProxy = await new Promise<boolean>((resolve) => {
      get(
        {headers: {host: domain}, host: '127.0.0.1', port, signal: AbortSignal.timeout(1000)},
        (response) => {
          response.resume()
          resolve(response.headers['x-sanity-portless'] === 'true')
        },
      ).on('error', () => resolve(false))
    })

    if (isSanityProxy) {
      server.on('error', () => {})
      takeover = setInterval(() => server.listening || server.listen(port), 1000)
    } else {
      proxied = false
      output.warn(
        `Can't use port ${port} for *.sanity.localhost URLs, so they include the dev server port: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return {
    close: async () => {
      clearInterval(takeover)
      watcher?.close()
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => server.close(resolve))
    },
    toPublicAddresses: (servers: DevServerManifest[]) =>
      servers.map((entry) =>
        entry.slug
          ? {...entry, host: `${entry.slug}.${shellHostname}`, port: proxied ? port : entry.port}
          : entry,
      ),
    url: new URL(`http://${shellHostname}:${proxied ? port : shellPort}`).origin,
  }
}

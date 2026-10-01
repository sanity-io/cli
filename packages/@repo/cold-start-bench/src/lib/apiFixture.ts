import {readFile, writeFile} from 'node:fs/promises'
import {createServer as createHttpServer, request} from 'node:http'
import {createServer as createHttpsServer} from 'node:https'
import {connect} from 'node:net'
import {join} from 'node:path'

import {execa} from 'execa'

export const FIXTURE_TOKEN = 'cold-start-fixture-token'

export interface FixtureOptions {
  dataset: string
  project: string
}

/** Fixed API responses; unknown routes fail the benchmark, including best-effort requests. */
export function fixtureResponse(method: string, path: string, options: FixtureOptions): unknown {
  const route = new URL(path, 'https://api.sanity.io').pathname.replace(/^\/v[^/]+/, '')
  const project = {
    createdAt: '2026-01-01T00:00:00.000Z',
    displayName: 'Benchmark Studio',
    id: options.project,
    members: [{id: 'benchmark-user', isRobot: false, role: 'administrator'}],
    metadata: {},
    organizationId: 'benchmark-org',
  }
  if (method === 'GET' && route === '/auth/providers') {
    return {
      providers: [
        {name: 'google', title: 'Google', url: 'https://api.sanity.io/auth/login/google'},
        {name: 'github', title: 'GitHub', url: 'https://api.sanity.io/auth/login/github'},
      ],
    }
  }
  if (method === 'GET' && route === '/users/me') {
    return {
      email: 'benchmark@example.invalid',
      id: 'benchmark-user',
      name: 'Benchmark User',
      provider: 'google',
    }
  }
  if (method === 'GET' && route === '/projects') return [project]
  if (route === `/projects/${options.project}` && ['GET', 'PATCH'].includes(method)) return project
  if (method === 'GET' && route === '/datasets') return [{aclMode: 'public', name: options.dataset}]
  throw new Error(`Unexpected fixture request: ${method} ${route}`)
}

/**
 * A local HTTPS fixture behind a CONNECT proxy. The real CLI and its HTTP clients
 * run unchanged. Only the child trusts the temporary certificate; no system trust
 * or DNS settings are changed. No upstream Sanity API connection is possible.
 */
export async function startApiFixture(
  options: FixtureOptions & {dir: string; registryUrl: string},
) {
  const keyPath = join(options.dir, 'fixture-key.pem')
  const certPath = join(options.dir, 'fixture-cert.pem')
  const configPath = join(options.dir, 'fixture-openssl.cnf')
  await writeFile(
    configPath,
    `[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=ext\n[dn]\nCN=api.sanity.io\n[ext]\nsubjectAltName=DNS:api.sanity.io,DNS:*.api.sanity.io,DNS:registry.npmjs.org,DNS:nodejs.org\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\n`,
  )
  await execa('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-keyout',
    keyPath,
    '-out',
    certPath,
    '-config',
    configPath,
  ])
  const nativeDownloads = new Map<string, Buffer>()
  let stats = {bytes: 0, requests: 0}
  const unexpected: string[] = []
  const requests: string[] = []
  const api = createHttpsServer(
    {cert: await readFile(certPath), key: await readFile(keyPath)},
    (req, res) => {
      const host = req.headers.host?.split(':')[0]
      if (host === 'nodejs.org') {
        const path = req.url ?? ''
        if (
          !/^\/download\/release\/v[\d.]+\/(?:SHASUMS256.txt|node-v[\d.]+-headers.tar.gz)$/.test(
            path,
          )
        ) {
          unexpected.push(`Unexpected Node download: ${path}`)
          res.writeHead(502)
          res.end()
          return
        }
        stats.requests++
        void (async () => {
          let body = nativeDownloads.get(path)
          if (!body) {
            const response = await fetch(`https://nodejs.org${path}`, {
              signal: AbortSignal.timeout(60_000),
            })
            if (!response.ok) throw new Error(`Node download failed: ${response.status}`)
            body = Buffer.from(await response.arrayBuffer())
            nativeDownloads.set(path, body)
          }
          stats.bytes += body.length
          res.writeHead(200, {'content-length': body.length})
          res.end(body)
        })().catch((error: unknown) => {
          unexpected.push(String(error))
          res.writeHead(502)
          res.end()
        })
        return
      }
      if (host === 'registry.npmjs.org') {
        // Version lookups sometimes ignore npm_config_registry. Keep them on the
        // same version-filtered mirror as npm installations.
        const upstream = request(
          new URL(req.url ?? '/', options.registryUrl),
          {headers: {...req.headers, host: new URL(options.registryUrl).host}, method: req.method},
          (response) => {
            res.writeHead(response.statusCode ?? 502, response.headers)
            response.pipe(res)
          },
        )
        upstream.on('error', () => {
          res.writeHead(502)
          res.end()
        })
        req.pipe(upstream)
        return
      }
      const label = `${req.method} ${req.url}`
      requests.push(label)
      try {
        if (
          req.url?.includes('/auth/providers') !== true &&
          req.headers.authorization !== `Bearer ${FIXTURE_TOKEN}`
        ) {
          throw new Error(`Missing fixture authentication: ${label}`)
        }
        const body = fixtureResponse(req.method ?? 'GET', req.url ?? '/', options)
        res.writeHead(200, {'content-type': 'application/json'})
        res.end(JSON.stringify(body))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        unexpected.push(message)
        res.writeHead(500, {'content-type': 'application/json'})
        res.end(JSON.stringify({error: message}))
      }
      req.resume()
    },
  )
  await new Promise<void>((resolve) => api.listen(0, '127.0.0.1', resolve))
  const address = api.address()
  if (!address || typeof address === 'string') throw new Error('Fixture has no port')
  const sockets = new Set<import('node:net').Socket>()
  const proxy = createHttpServer((req, res) => {
    unexpected.push(`Unexpected proxy request: ${req.method} ${req.url}`)
    res.writeHead(502)
    res.end()
  })
  proxy.on('connect', (req, socket, head) => {
    const host = req.url?.replace(/:443$/, '') ?? ''
    if (
      !/^(?:[a-z0-9-]+\.)?api\.sanity\.io$/.test(host) &&
      host !== 'registry.npmjs.org' &&
      host !== 'nodejs.org'
    ) {
      unexpected.push(`Unexpected proxy destination: ${req.url}`)
      socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      return
    }
    const upstream = connect(address.port, '127.0.0.1', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head.length > 0) upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    sockets.add(upstream)
    upstream.on('close', () => sockets.delete(upstream))
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
    socket.on('close', () => upstream.destroy())
  })
  proxy.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve))
  const proxyAddress = proxy.address()
  if (!proxyAddress || typeof proxyAddress === 'string') throw new Error('Proxy has no port')
  const proxyUrl = `http://127.0.0.1:${proxyAddress.port}`
  return {
    async close() {
      for (const socket of sockets) socket.destroy()
      api.closeAllConnections()
      await Promise.all(
        [api, proxy].map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
      )
    },
    env: {
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      NO_PROXY: 'localhost,127.0.0.1,::1',
      NODE_EXTRA_CA_CERTS: certPath,
      NODE_USE_ENV_PROXY: '1',
    },
    requests,
    resetStats() {
      const result = stats
      stats = {bytes: 0, requests: 0}
      return result
    },
    unexpected,
  }
}

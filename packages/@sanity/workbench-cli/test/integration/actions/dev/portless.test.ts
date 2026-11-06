import assert from 'node:assert'
import {once} from 'node:events'
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {createServer, type IncomingHttpHeaders, request} from 'node:http'
import {connect, createServer as createTcpServer, type Server} from 'node:net'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  aDevServerManifest,
  createMockOutput,
} from '../../../../src/actions/dev/__tests__/devTestHelpers.js'
import {startPortlessProxy} from '../../../../src/actions/dev/portless.js'
import {acquireWorkbenchLock} from '../../../../src/actions/dev/registry.js'

const mockGetSanityDataDir = vi.hoisted(() => vi.fn())
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getSanityDataDir: mockGetSanityDataDir,
}))

vi.mock('../../../../src/actions/dev/processLiveness.js', () => ({
  getProcessStartTime: vi.fn(() => undefined),
  isOurProcess: vi.fn(() => true),
}))

const HOST = '127.0.0.1'
const ORG = 'oSyH1iET5'
const OTHER_ORG = 'oOtherOrg'
const cleanups: Array<() => Promise<unknown> | void> = []
let dataDir: string
let output: ReturnType<typeof createMockOutput>
let nextPid = 1000

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'portless-'))
  mkdirSync(join(dataDir, 'dev-servers'))
  mockGetSanityDataDir.mockReturnValue(dataDir)
  output = createMockOutput()
})

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup()
  rmSync(dataDir, {force: true, recursive: true})
})

function portOf(server: Server) {
  const address = server.address()
  assert.ok(address !== null && typeof address === 'object')

  return address.port
}

async function listening(server: Server) {
  server.listen(0, HOST)
  await once(server, 'listening')
  cleanups.push(() => new Promise((resolve) => server.close(resolve)))

  return portOf(server)
}

async function freePort() {
  const server = createServer().listen(0)
  await once(server, 'listening')
  const port = portOf(server)
  await new Promise((resolve) => server.close(resolve))

  return port
}

async function upstream(name: string) {
  const received: IncomingHttpHeaders[] = []
  const server = createServer((req, res) => {
    received.push(req.headers)
    res.writeHead(201, {'content-type': 'text/javascript'}).end(`${name} ${req.url}`)
  })
  server.on('upgrade', (req, socket) => {
    received.push(req.headers)
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
    )
    socket.pipe(socket)
  })

  return {port: await listening(server), received}
}

async function startShell(organizationId: string) {
  const shell = await upstream(`shell ${organizationId}`)
  const lock = acquireWorkbenchLock({host: HOST, organizationId, port: shell.port})
  assert.ok(lock)
  cleanups.push(() => lock.release())

  return shell
}

function registerApp(organizationId: string, slug: string, port: number, pid = nextPid++) {
  writeFileSync(
    join(dataDir, 'dev-servers', `${pid}.json`),
    JSON.stringify(aDevServerManifest({host: HOST, organizationId, pid, port, slug})),
  )

  return pid
}

async function startProxy(port: number, organizationId = ORG) {
  const proxy = await startPortlessProxy({organizationId, output, port, shellPort: 3333})
  cleanups.push(() => proxy.close())

  return proxy
}

function get(port: number, host: string, path = '/') {
  return new Promise<{body: string; headers: IncomingHttpHeaders; status?: number}>(
    (resolve, reject) => {
      request({headers: {host: `${host}:${port}`}, host: HOST, path, port}, async (res) => {
        let body = ''
        for await (const chunk of res) body += chunk
        resolve({body, headers: res.headers, status: res.statusCode})
      })
        .on('error', reject)
        .end()
    },
  )
}

async function upgrade(port: number, host: string) {
  const socket = connect(port, HOST)
  cleanups.push(() => socket.destroy())
  await once(socket, 'connect')
  socket.write(
    `GET /?token=abc HTTP/1.1\r\nHost: ${host}:${port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
  )

  return socket
}

describe('startPortlessProxy', () => {
  test('serves its own shell and the shells of organizations with registered apps', async () => {
    await startShell(ORG)
    await startShell(OTHER_ORG)
    registerApp(OTHER_ORG, 'other-app', 1)
    const port = await freePort()
    const proxy = await startProxy(port)

    expect(proxy.url).toBe(`http://osyh1iet5.sanity.localhost:${port}`)
    expect((await get(port, 'osyh1iet5.sanity.localhost')).body).toBe(`shell ${ORG} /`)
    expect((await get(port, 'ootherorg.sanity.localhost')).body).toBe(`shell ${OTHER_ORG} /`)
  })

  test('toPublicAddresses rewrites app addresses to `<slug>.<org>.sanity.localhost` on the proxy port', async () => {
    const port = await freePort()
    const proxy = await startProxy(port)

    const routed = proxy.toPublicAddresses([
      aDevServerManifest({host: 'localhost', port: 3334, slug: 'my-app'}),
      aDevServerManifest({host: 'localhost', id: 'config:mediaLibrary', port: 4000}),
    ])

    expect(routed.map(({host, port}) => ({host, port}))).toEqual([
      {host: 'my-app.osyh1iet5.sanity.localhost', port},
      {host: 'localhost', port: 4000},
    ])
  })

  test('forwards requests to apps registered after it started', async () => {
    const port = await freePort()
    await startProxy(port)
    const app = await upstream('app')
    registerApp(ORG, 'my-app', app.port)

    const res = await get(port, 'my-app.osyh1iet5.sanity.localhost', '/mf-manifest.json')

    expect(res).toMatchObject({body: 'app /mf-manifest.json', status: 201})
    expect(res.headers['content-type']).toBe('text/javascript')
    expect(app.received[0].host).toBe(`my-app.osyh1iet5.sanity.localhost:${port}`)
  })

  test('follows an app to the port it registers again on', async () => {
    const port = await freePort()
    await startProxy(port)
    const before = await upstream('before')
    const pid = registerApp(ORG, 'my-app', before.port)
    expect((await get(port, 'my-app.osyh1iet5.sanity.localhost')).body).toBe('before /')

    const after = await upstream('after')
    registerApp(ORG, 'my-app', after.port, pid)

    await vi.waitFor(
      async () =>
        expect((await get(port, 'my-app.osyh1iet5.sanity.localhost')).body).toBe('after /'),
      {timeout: 10_000},
    )
  })

  test('answers 404 for hostnames it does not route', async () => {
    const port = await freePort()
    await startProxy(port)

    expect((await get(port, 'localhost')).status).toBe(404)
  })

  test('answers 502 when a routed app is gone', async () => {
    const port = await freePort()
    await startProxy(port)
    registerApp(ORG, 'my-app', await freePort())

    expect((await get(port, 'my-app.osyh1iet5.sanity.localhost')).status).toBe(502)
  })

  test('forwards websocket upgrades with their handshake headers', async () => {
    const shell = await startShell(ORG)
    const port = await freePort()
    await startProxy(port)
    const socket = await upgrade(port, 'osyh1iet5.sanity.localhost')

    const [handshake] = await once(socket, 'data')
    socket.write('ping')
    const [echo] = await once(socket, 'data')

    expect(String(handshake)).toMatch(/^HTTP\/1\.1 101/)
    expect(String(echo)).toBe('ping')
    expect(shell.received[0]).toMatchObject({
      host: `osyh1iet5.sanity.localhost:${port}`,
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
    })
  })

  test('closes the client socket when a routed app refuses the upgrade', async () => {
    const port = await freePort()
    await startProxy(port)
    registerApp(ORG, 'my-app', await freePort())
    const socket = await upgrade(port, 'my-app.osyh1iet5.sanity.localhost')

    await once(socket, 'close')

    expect(socket.destroyed).toBe(true)
  })

  test('closes the upstream response when the client aborts', async () => {
    const app = createServer((_, res) => {
      res.write('first chunk')
      res.once('close', () => app.emit('upstream-closed'))
    })
    registerApp(ORG, 'my-app', await listening(app))
    const port = await freePort()
    await startProxy(port)
    const upstreamClosed = once(app, 'upstream-closed')

    const req = request(
      {headers: {host: `my-app.osyh1iet5.sanity.localhost:${port}`}, host: HOST, port},
      (res) => res.once('data', () => req.destroy()),
    )
    req.on('error', () => {}).end()

    await expect(upstreamClosed).resolves.toBeDefined()
  })

  test('close resolves while a websocket connection is still open', async () => {
    await startShell(ORG)
    const port = await freePort()
    const proxy = await startProxy(port)
    const socket = await upgrade(port, 'osyh1iet5.sanity.localhost')
    await once(socket, 'data')

    await expect(proxy.close()).resolves.toBeUndefined()
  })

  test('retries the port while another Sanity proxy holds it and takes over when that proxy closes', async () => {
    vi.useFakeTimers({toFake: ['setInterval', 'clearInterval']})
    cleanups.push(() => vi.useRealTimers())
    await startShell(OTHER_ORG)
    registerApp(OTHER_ORG, 'other-app', 1)
    const port = await freePort()
    const first = await startProxy(port)
    const second = await startProxy(port, OTHER_ORG)
    vi.advanceTimersByTime(1000)

    expect(second.url).toBe(`http://ootherorg.sanity.localhost:${port}`)
    expect((await get(port, 'ootherorg.sanity.localhost')).body).toBe(`shell ${OTHER_ORG} /`)

    await first.close()
    vi.advanceTimersByTime(1000)

    await vi.waitFor(
      async () =>
        expect((await get(port, 'ootherorg.sanity.localhost')).body).toBe(`shell ${OTHER_ORG} /`),
      {timeout: 10_000},
    )
    expect(vi.getTimerCount()).toBe(0)
  })

  test.each([
    ['never answers', () => createTcpServer((socket) => cleanups.push(() => socket.destroy()))],
    ['is another kind of server', () => createServer((_, res) => res.end())],
  ])(
    'keeps the hostnames on the dev server ports when the server holding the port %s',
    async (_, createHolder) => {
      const holder = createHolder().listen(0)
      cleanups.push(() => new Promise((resolve) => holder.close(resolve)))
      await once(holder, 'listening')

      const proxy = await startProxy(portOf(holder))

      expect(proxy.url).toBe('http://osyh1iet5.sanity.localhost:3333')
      expect(
        proxy.toPublicAddresses([aDevServerManifest({port: 3334, slug: 'my-app'})]),
      ).toMatchObject([{host: 'my-app.osyh1iet5.sanity.localhost', port: 3334}])
      expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('EADDRINUSE'))
    },
  )
})

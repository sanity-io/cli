/* eslint-disable unicorn/prefer-event-target -- HTTP servers and streams implement EventEmitter. */
import {EventEmitter} from 'node:events'
import {readFile} from 'node:fs/promises'
import {createServer as createHttpServer, request} from 'node:http'
import {createServer as createHttpsServer} from 'node:https'
import {connect} from 'node:net'

import {afterEach, beforeEach, expect, test, vi} from 'vitest'

import {FIXTURE_TOKEN, startApiFixture} from '../apiFixture.ts'

vi.mock('node:fs/promises', () => ({readFile: vi.fn(), writeFile: vi.fn()}))
vi.mock('node:http', () => ({createServer: vi.fn(), request: vi.fn()}))
vi.mock('node:https', () => ({createServer: vi.fn()}))
vi.mock('node:net', () => ({connect: vi.fn()}))
vi.mock('execa', () => ({execa: vi.fn()}))

type Handler = (req: ReturnType<typeof incoming>, res: ReturnType<typeof response>) => void
let apiHandler: Handler
let proxyHandler: Handler
let fixture: Awaited<ReturnType<typeof startApiFixture>>
const api = fakeServer()
const proxy = fakeServer()

function fakeServer() {
  return Object.assign(new EventEmitter(), {
    address: vi.fn(() => ({port: 12_345})),
    close: vi.fn((callback: () => void) => callback()),
    closeAllConnections: vi.fn(),
    listen: vi.fn((_port: number, _host: string, callback: () => void) => callback()),
  })
}
function response() {
  return {end: vi.fn(), writeHead: vi.fn()}
}
function incoming(url: string, host = 'api.sanity.io', token = FIXTURE_TOKEN) {
  return {
    headers: {authorization: `Bearer ${token}`, host},
    method: 'GET',
    pipe: vi.fn(),
    resume: vi.fn(),
    url,
  }
}

beforeEach(async () => {
  api.removeAllListeners()
  proxy.removeAllListeners()
  vi.mocked(readFile).mockResolvedValue(Buffer.from('certificate'))
  vi.mocked(createHttpsServer).mockImplementation((_options, callback) => {
    apiHandler = callback as unknown as Handler
    return api as unknown as ReturnType<typeof createHttpsServer>
  })
  vi.mocked(createHttpServer).mockImplementation((callback) => {
    proxyHandler = callback as unknown as Handler
    return proxy as unknown as ReturnType<typeof createHttpServer>
  })
  fixture = await startApiFixture({
    dataset: 'production',
    dir: '/tmp/fixture',
    project: 'bench123',
    registryUrl: 'http://127.0.0.1:9000/',
  })
})
afterEach(async () => {
  await fixture.close()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

test('exposes isolated proxy/trust settings and authenticates fixture requests', () => {
  expect(fixture.env).toMatchObject({
    HTTPS_PROXY: 'http://127.0.0.1:12345',
    NO_PROXY: 'localhost,127.0.0.1,::1',
    NODE_EXTRA_CA_CERTS: '/tmp/fixture/fixture-cert.pem',
  })
  const res = response()
  apiHandler(incoming('/v1/projects'), res)
  expect(res.writeHead).toHaveBeenCalledWith(200, {'content-type': 'application/json'})
  expect(JSON.parse(res.end.mock.calls[0][0])).toEqual([expect.objectContaining({id: 'bench123'})])
  expect(fixture.requests).toEqual(['GET /v1/projects'])
  expect(fixture.unexpected).toEqual([])
})

test('rejects missing authentication and unrecognized API routes', () => {
  for (const req of [
    incoming('/v1/projects', 'api.sanity.io', 'wrong-token'),
    incoming('/v1/unknown'),
  ]) {
    const res = response()
    apiHandler(req, res)
    expect(res.writeHead).toHaveBeenCalledWith(500, {'content-type': 'application/json'})
  }
  expect(fixture.unexpected).toEqual([
    'Missing fixture authentication: GET /v1/projects',
    'Unexpected fixture request: GET /unknown',
  ])
})

test('permits unauthenticated provider lookup', () => {
  const res = response()
  apiHandler(incoming('/v1/auth/providers', 'api.sanity.io', ''), res)
  expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object))
})

test('routes npm version lookups to the local registry', () => {
  const upstream = Object.assign(new EventEmitter(), {headers: {}, pipe: vi.fn(), statusCode: 200})
  vi.mocked(request).mockImplementation((_url, _options, callback) => {
    callback!(upstream as unknown as Parameters<NonNullable<typeof callback>>[0])
    return upstream as unknown as ReturnType<typeof request>
  })
  const res = response()
  apiHandler(incoming('/sanity', 'registry.npmjs.org'), res)
  expect(request).toHaveBeenCalledWith(
    new URL('http://127.0.0.1:9000/sanity'),
    expect.objectContaining({headers: expect.objectContaining({host: '127.0.0.1:9000'})}),
    expect.any(Function),
  )
  expect(upstream.pipe).toHaveBeenCalledWith(res)
  upstream.emit('error', new Error('disconnected'))
  expect(res.writeHead).toHaveBeenCalledWith(502)
})

test('caches native build downloads and counts bytes on every run', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('headers')),
  )
  const url = '/download/release/v24.11.1/node-v24.11.1-headers.tar.gz'
  for (let i = 0; i < 2; i++) {
    const res = response()
    apiHandler(incoming(url, 'nodejs.org'), res)
    await vi.waitFor(() => expect(res.end).toHaveBeenCalledWith(Buffer.from('headers')))
    expect(fixture.resetStats()).toEqual({bytes: 7, requests: 1})
    expect(fixture.resetStats()).toEqual({bytes: 0, requests: 0})
  }
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('rejects unknown native paths and failed downloads', async () => {
  const invalid = response()
  apiHandler(incoming('/unexpected', 'nodejs.org'), invalid)
  expect(invalid.writeHead).toHaveBeenCalledWith(502)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', {status: 404})),
  )
  const failed = response()
  apiHandler(incoming('/download/release/v24.11.1/SHASUMS256.txt', 'nodejs.org'), failed)
  await vi.waitFor(() => expect(failed.writeHead).toHaveBeenCalledWith(502))
  expect(fixture.unexpected).toEqual([
    'Unexpected Node download: /unexpected',
    'Error: Node download failed: 404',
  ])
})

test('rejects unknown proxy destinations and ordinary HTTP requests', () => {
  const socket = {end: vi.fn()}
  proxy.emit('connect', {url: 'unexpected.example:443'}, socket, Buffer.alloc(0))
  expect(socket.end).toHaveBeenCalledWith('HTTP/1.1 502 Bad Gateway\r\n\r\n')
  expect(connect).not.toHaveBeenCalled()
  const res = response()
  proxyHandler(incoming('http://unexpected.example'), res)
  expect(res.writeHead).toHaveBeenCalledWith(502)
  expect(fixture.unexpected).toHaveLength(2)
})

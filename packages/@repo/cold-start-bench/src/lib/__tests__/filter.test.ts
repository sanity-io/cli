import {createServer, get as httpGet, type IncomingHttpHeaders, type Server} from 'node:http'
import {gunzipSync, gzipSync} from 'node:zlib'

import {afterEach, describe, expect, test} from 'vitest'

import {
  abbreviatePackument,
  filterPackument,
  packumentName,
  startVersionFilter,
  type VersionFilter,
} from '../filter.ts'

const BASE = '3.8.1000000001'
const HEAD = '3.8.1000000002'

const doc = {
  'dist-tags': {'cold-start-bench': HEAD, 'latest': '3.8.1', 'next': '3.9.0-next.1'},
  'name': '@sanity/cli-core',
  'time': {'3.8.1': 't1', [BASE]: 't2', [HEAD]: 't3', modified: 't3'},
  'versions': {'3.8.1': {}, '3.9.0-next.1': {}, [BASE]: {}, [HEAD]: {}},
}

describe('filterPackument', () => {
  test('keeps published versions and the active bench version only', () => {
    expect(filterPackument(doc, HEAD)).toEqual({
      'dist-tags': {latest: HEAD, next: '3.9.0-next.1'},
      'name': '@sanity/cli-core',
      'time': {'3.8.1': 't1', [HEAD]: 't3', 'modified': 't3'},
      'versions': {'3.8.1': {}, '3.9.0-next.1': {}, [HEAD]: {}},
    })
  })

  test('handles abbreviated metadata without time or tags', () => {
    expect(filterPackument({name: 'x', versions: {[BASE]: {}}}, HEAD)).toEqual({
      'dist-tags': {latest: HEAD},
      'name': 'x',
      'versions': {},
    })
  })
})

describe('packumentName', () => {
  test.each([
    ['/sanity', 'sanity'],
    ['/@sanity%2fcli', '@sanity/cli'],
    ['/@sanity%2Fcli?write=true', '@sanity/cli'],
    ['/@sanity/cli', '@sanity/cli'],
    ['/sanity/-/sanity-6.17.0.tgz', null],
    ['/@sanity/cli/-/cli-8.13.0.tgz', null],
    ['/-/ping', null],
    ['/', null],
    ['/a/b', null],
    ['/@scope', null],
  ])('%s → %s', (url, expected) => {
    expect(packumentName(url)).toBe(expected)
  })
})

describe('abbreviatePackument', () => {
  test('drops what npm leaves out of install metadata', () => {
    expect(
      abbreviatePackument({
        'dist-tags': {latest: '1.0.0'},
        'modified': 't',
        'name': 'x',
        'time': {'1.0.0': 't'},
        'versions': {
          '1.0.0': {
            _hasShrinkwrap: false,
            description: 'long text',
            directories: {},
            dist: {tarball: 'u'},
            hasInstallScript: false,
            name: 'x',
            version: '1.0.0',
          },
          '2.0.0': {directories: {bin: './bin'}, hasInstallScript: true, name: 'x', version: '2.0.0'},
          '3.0.0': null,
        },
      }),
    ).toEqual({
      'dist-tags': {latest: '1.0.0'},
      'modified': 't',
      'name': 'x',
      'versions': {
        '1.0.0': {dist: {tarball: 'u'}, name: 'x', version: '1.0.0'},
        '2.0.0': {directories: {bin: './bin'}, hasInstallScript: true, name: 'x', version: '2.0.0'},
        '3.0.0': {},
      },
    })
  })

  test('handles a document without versions', () => {
    expect(abbreviatePackument({name: 'x'})).toEqual({name: 'x', versions: {}})
  })
})

const ABBREVIATED = 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*'

describe('startVersionFilter', () => {
  let upstream: Server
  let filter: VersionFilter
  const seen: {encoding?: string; host?: string; url?: string}[] = []

  afterEach(async () => {
    seen.length = 0
    await filter?.close()
    await new Promise((resolve) => upstream?.close(resolve))
  })

  async function start(handler: Parameters<typeof createServer>[1]) {
    upstream = createServer((req, res) => {
      seen.push({encoding: req.headers['accept-encoding'], host: req.headers.host, url: req.url})
      handler!(req, res)
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    const address = upstream.address()
    if (!address || typeof address === 'string') throw new Error('no port')
    filter = await startVersionFilter(address.port)
  }

  function get(path: string, headers: Record<string, string> = {}) {
    return new Promise<{body: Buffer; headers: IncomingHttpHeaders; status: number}>((resolve, reject) => {
      httpGet({headers, host: '127.0.0.1', path, port: filter.port}, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve({body: Buffer.concat(chunks), headers: res.headers, status: res.statusCode!}))
      }).on('error', reject)
    })
  }

  test('filters, abbreviates, gzips and caches metadata', async () => {
    await start((req, res) => {
      res.writeHead(200, {'content-type': 'application/json', 'etag': '"x"'})
      res.end(JSON.stringify(doc))
    })
    filter.setActive(new Map([['@sanity/cli-core', HEAD]]))

    const first = await get('/@sanity%2fcli-core', {'accept': ABBREVIATED, 'accept-encoding': 'gzip'})
    expect(first.status).toBe(200)
    expect(first.headers).toMatchObject({
      'content-encoding': 'gzip',
      'content-type': 'application/vnd.npm.install-v1+json',
    })
    expect(first.headers.etag).toBeUndefined()
    const parsed = JSON.parse(gunzipSync(first.body).toString())
    expect(parsed['dist-tags'].latest).toBe(HEAD)
    expect(parsed).not.toHaveProperty('time')
    expect(Object.keys(parsed.versions)).toEqual(['3.8.1', '3.9.0-next.1', HEAD])
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({encoding: 'identity', host: `127.0.0.1:${filter.port}`})

    // Served from the cache, uncompressed when gzip isn't accepted
    const second = await get('/@sanity%2fcli-core', {accept: ABBREVIATED})
    expect(second.headers['content-encoding']).toBeUndefined()
    expect(JSON.parse(second.body.toString())).toEqual(parsed)
    expect(seen).toHaveLength(1)

    // A different variant is a different cache entry
    filter.setActive(new Map([['@sanity/cli-core', BASE]]))
    const other = JSON.parse((await get('/@sanity%2fcli-core', {accept: ABBREVIATED})).body.toString())
    expect(other['dist-tags'].latest).toBe(BASE)
    expect(seen).toHaveLength(2)

    // Full documents keep their time field
    const full = JSON.parse((await get('/@sanity%2fcli-core')).body.toString())
    expect(full).toHaveProperty('time')
    expect(full.versions).not.toHaveProperty(HEAD)
  })

  test('passes tarballs and errors through untouched', async () => {
    await start((req, res) => {
      if (req.url === '/x/-/x-1.0.0.tgz') {
        res.writeHead(200, {'content-encoding': 'gzip'})
        res.end(gzipSync('tarball'))
      } else {
        res.writeHead(404)
        res.end('nope')
      }
    })
    const tarball = await get('/x/-/x-1.0.0.tgz', {'accept-encoding': 'gzip'})
    expect(gunzipSync(tarball.body).toString()).toBe('tarball')
    expect(seen[0].encoding).toBe('gzip')

    const missing = await get('/sanity', {accept: ABBREVIATED})
    expect(missing.status).toBe(404)
    expect(missing.body.toString()).toBe('nope')
  })

  test('forwards request bodies', async () => {
    await start((req, res) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => res.end(body))
    })
    const response = await fetch(`http://127.0.0.1:${filter.port}/sanity`, {body: 'publish', method: 'PUT'})
    expect(await response.text()).toBe('publish')
  })

  test('answers 502 when the registry is down', async () => {
    await start(() => {})
    await new Promise((resolve) => upstream.close(resolve))
    upstream.closeAllConnections()
    expect((await fetch(`http://127.0.0.1:${filter.port}/sanity`)).status).toBe(502)
  })
})

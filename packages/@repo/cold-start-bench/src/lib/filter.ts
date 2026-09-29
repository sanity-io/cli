import {
  Agent,
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  request,
  type ServerResponse,
} from 'node:http'
import {gzipSync} from 'node:zlib'

import {isBenchVersion} from './manifest.ts'

export interface Packument {
  [key: string]: unknown

  'dist-tags'?: Record<string, string>
  'time'?: Record<string, string>
  'versions'?: Record<string, unknown>
}

/**
 * Hides every bench version except `active` and makes `active` the `latest`
 * release, so npm sees the variant under test as the newest publish and
 * nothing of the other variant.
 */
export function filterPackument(doc: Packument, active: string): Packument {
  const keep = (version: string) => version === active || !isBenchVersion(version)
  const filtered: Packument = {...doc}
  if (doc.versions) {
    filtered.versions = Object.fromEntries(Object.entries(doc.versions).filter(([v]) => keep(v)))
  }
  if (doc.time) {
    filtered.time = Object.fromEntries(Object.entries(doc.time).filter(([v]) => keep(v)))
  }
  const tags = Object.entries(doc['dist-tags'] ?? {}).filter(([, v]) => !isBenchVersion(v))
  filtered['dist-tags'] = {...Object.fromEntries(tags), latest: active}
  return filtered
}

const ABBREVIATED = 'application/vnd.npm.install-v1+json'

/**
 * Trims metadata to the shape npmjs.org serves for installs. Verdaccio adds a
 * `time` entry per version and a few per-version fields, which makes its
 * install metadata about 1.45× larger than what users download.
 */
export function abbreviatePackument(doc: Packument): Packument {
  const {time: _time, ...rest} = doc
  const versions = Object.fromEntries(
    Object.entries(doc.versions ?? {}).map(([version, value]) => {
      const {description: _description, ...manifest} = (value ?? {}) as Record<string, unknown>
      for (const flag of ['_hasShrinkwrap', 'hasInstallScript']) {
        if (!manifest[flag]) delete manifest[flag]
      }
      const directories = manifest.directories as object | undefined
      if (directories && Object.keys(directories).length === 0) delete manifest.directories
      return [version, manifest]
    }),
  )
  return {...rest, versions}
}

/** Package name for a metadata request, or `null` for tarballs and other routes */
export function packumentName(url: string): string | null {
  const path = url.split('?')[0].slice(1)
  if (path === '' || path.startsWith('-/') || path.includes('/-/')) return null
  const name = decodeURIComponent(path)
  const valid = name.startsWith('@') ? /^@[^/]+\/[^/]+$/.test(name) : !name.includes('/')
  return valid ? name : null
}

export interface VersionFilter {
  close(): Promise<void>
  port: number
  /** Returns response bytes and request count since the last call, and zeroes them */
  resetStats(): {bytes: number; requests: number}
  /** Package name → version to present as `latest`; other bench versions are hidden */
  setActive(versions: ReadonlyMap<string, string>): void
}

interface CachedPackument {
  gzip: Buffer
  json: Buffer
  type: string
}

/**
 * An HTTP proxy in front of the registry that serves package metadata the way
 * npmjs.org does, with only the active variant's bench versions visible.
 *
 * - Bench versions of other variants are hidden ({@link filterPackument})
 * - Install metadata is trimmed to npm's shape ({@link abbreviatePackument})
 * - Metadata is gzipped when the client accepts it, as npm's CDN does
 * - Results are cached in memory, so timed runs don't wait for verdaccio to
 *   re-read and re-serialize documents of tens of megabytes
 *
 * The `Host` header is forwarded and part of the cache key, because tarball
 * URLs in the metadata are built from it and must point back at the proxy the
 * client connected to.
 */
export async function startVersionFilter(targetPort: number): Promise<VersionFilter> {
  let active: ReadonlyMap<string, string> = new Map()
  const agent = new Agent({keepAlive: true})
  const cache = new Map<string, CachedPackument>()
  let stats = {bytes: 0, requests: 0}

  function send(req: IncomingMessage, res: ServerResponse, doc: CachedPackument) {
    const gzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
    const body = gzip ? doc.gzip : doc.json
    stats.bytes += body.length
    res.writeHead(200, {
      'content-length': body.length,
      'content-type': doc.type,
      ...(gzip ? {'content-encoding': 'gzip'} : {}),
    })
    res.end(body)
  }

  const server = createServer((req, res) => {
    stats.requests++
    const name = req.method === 'GET' && req.url ? packumentName(req.url) : null
    const headers: IncomingHttpHeaders = {...req.headers}
    let key: string | undefined
    let abbreviated = false
    if (name) {
      abbreviated = String(req.headers.accept ?? '').includes(ABBREVIATED)
      key = [req.headers.host, abbreviated, name, active.get(name) ?? ''].join('|')
      const cached = cache.get(key)
      if (cached) {
        send(req, res, cached)
        return
      }
      headers['accept-encoding'] = 'identity'
    }

    const version = name ? active.get(name) : undefined
    const upstream = request(
      {agent, headers, host: '127.0.0.1', method: req.method, path: req.url, port: targetPort},
      (response) => {
        if (!key || response.statusCode !== 200) {
          res.writeHead(response.statusCode ?? 502, response.headers)
          response.on('data', (chunk: Buffer) => (stats.bytes += chunk.length))
          response.pipe(res)
          return
        }
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          let doc: Packument = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (version) doc = filterPackument(doc, version)
          if (abbreviated) doc = abbreviatePackument(doc)
          const json = Buffer.from(JSON.stringify(doc))
          const entry = {
            gzip: gzipSync(json),
            json,
            type: abbreviated ? ABBREVIATED : 'application/json',
          }
          cache.set(key, entry)
          send(req, res, entry)
        })
      },
    )
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502)
      res.end()
    })
    req.pipe(upstream)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Version filter has no port')

  return {
    close: () =>
      new Promise((resolve) => {
        agent.destroy()
        server.closeAllConnections()
        server.close(() => resolve())
      }),
    port: address.port,
    resetStats() {
      const current = stats
      stats = {bytes: 0, requests: 0}
      return current
    },
    setActive(versions) {
      active = versions
    },
  }
}

/* eslint-disable no-console */
import {createHash} from 'node:crypto'
import {once} from 'node:events'
import {mkdir, mkdtemp, readdir, readFile, rm, stat} from 'node:fs/promises'
import {createServer} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'

import {execa} from 'execa'

import {packWorkspacePackage, writeShrinkwrap} from './npm-shrinkwrap.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const registryHost = 'https://registry.npmjs.org'
const staging = await mkdtemp(join(tmpdir(), 'sanity-create-preview-'))
const packages = new Map()
const upstreamMetadata = new Map()
const registry = createServer((request, response) => {
  servePackage(request, response).catch(() => {
    response.writeHead(502).end('Could not read package metadata')
  })
})

async function servePackage(request, response) {
  const incoming = new URL(request.url, registryHost)
  const upstreamUrl = new URL(registryHost)
  upstreamUrl.pathname = incoming.pathname
  const [name, tarball] = decodeURIComponent(incoming.pathname.slice(1)).split('/-/')
  const pkg = packages.get(name)

  if (pkg && tarball === pkg.filename) {
    response
      .writeHead(200, {
        'Content-Length': pkg.bytes.length,
        'Content-Type': 'application/octet-stream',
      })
      .end(pkg.bytes)
    return
  }
  if (!pkg || tarball) {
    response.writeHead(307, {Location: upstreamUrl.href}).end()
    return
  }

  // Studio packages installed by the classic path can request published
  // versions of the same packages this registry serves from the branch.
  let published = {}
  if (name !== 'create-sanity' && name !== '@sanity/cli-setup') {
    if (!upstreamMetadata.has(name)) {
      upstreamMetadata.set(
        name,
        fetch(upstreamUrl, {
          headers: {Accept: 'application/vnd.npm.install-v1+json'},
          signal: AbortSignal.timeout(10_000),
        })
          .then((result) => (result.ok ? result.json() : {}))
          .catch(() => ({})),
      )
    }
    published = await upstreamMetadata.get(name)
  }
  const {version} = pkg.manifest
  response.writeHead(200, {'Content-Type': 'application/json'}).end(
    JSON.stringify({
      'dist-tags': {...published['dist-tags'], blueprints: version, latest: version},
      name,
      versions: {...published.versions, [version]: pkg.manifest},
    }),
  )
}

async function register(manifest, archive, {locked = false} = {}) {
  const bytes = await readFile(archive)
  const filename = `${manifest.name.split('/').at(-1)}-${manifest.version}.tgz`
  const tarball = `${registryUrl}/${manifest.name}/-/${filename}`
  packages.set(manifest.name, {
    bytes,
    filename,
    manifest: {
      ...manifest,
      ...(locked ? {_hasShrinkwrap: true} : {}),
      dist: {
        integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
        shasum: createHash('sha1').update(bytes).digest('hex'),
        tarball,
      },
    },
  })
}

async function pack(name, {lock = false} = {}) {
  const key = name.split('/').at(-1)
  const archive = join(staging, `${key}.tgz`)
  const manifest = await packWorkspacePackage(join(root, 'packages', name), archive)
  if (!lock) {
    await register(manifest, archive)
    return
  }

  const extracted = join(staging, key)
  await mkdir(extracted)
  await execa('tar', ['-xf', archive, '-C', extracted])
  const directory = join(extracted, 'package')
  await writeShrinkwrap(manifest, join(directory, 'npm-shrinkwrap.json'), {env: npmEnv})
  const {stdout} = await execa(
    'npm',
    ['pack', '--ignore-scripts', '--pack-destination', extracted, '--json'],
    {cwd: directory, env: npmEnv},
  )
  await register(manifest, join(extracted, JSON.parse(stdout)[0].filename), {locked: true})
}

async function runInitializer(args) {
  const cwd = await mkdtemp(join(tmpdir(), 'sanity-create-workspace-'))
  const cache = join(staging, 'cold-npm-cache')
  console.log(`Preview workspace: ${cwd}`)
  const start = performance.now()
  const child = execa('npm', ['create', '--yes', 'sanity@blueprints', '--', ...args], {
    cwd,
    env: {...npmEnv, npm_config_cache: cache},
    reject: false,
    stderr: 'inherit',
    stdin: 'inherit',
    stdout: 'pipe',
  })
  const lines = createInterface({input: child.stdout})
  let firstFeedback
  for await (const line of lines) {
    if (line === 'Setting up a Blueprint') firstFeedback ??= performance.now() - start
    console.log(line)
  }
  const result = await child
  if (firstFeedback !== undefined) {
    console.log(`First Blueprint feedback: ${(firstFeedback / 1000).toFixed(2)}s (fresh npm cache)`)
  }
  console.log(
    `Command exit: ${((performance.now() - start) / 1000).toFixed(2)}s (code ${result.exitCode ?? 1})`,
  )
  if (result.exitCode === 0) await reportDownloads(cache)
  process.exitCode = result.exitCode ?? 1
}

async function reportDownloads(cache) {
  const installs = join(cache, '_npx')
  const seen = new Set()
  let bytes = 0
  for (const install of await readdir(installs)) {
    const dir = join(installs, install)
    const lock = JSON.parse(await readFile(join(dir, 'package-lock.json'), 'utf8'))
    for (const {integrity} of Object.values(lock.packages)) {
      if (!integrity || seen.has(integrity)) continue
      const [algorithm, digest] = integrity.split(' ')[0].split('-')
      const hash = Buffer.from(digest, 'base64').toString('hex')
      const archive = join(
        cache,
        '_cacache',
        'content-v2',
        algorithm,
        hash.slice(0, 2),
        hash.slice(2, 4),
        hash.slice(4),
      )
      try {
        bytes += (await stat(archive)).size
        seen.add(integrity)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
  }
  console.log(
    `Initializer downloads: ${seen.size} tarballs, ${(bytes / 1_000_000).toFixed(2)} MB compressed`,
  )
}

registry.listen(0, '127.0.0.1')
await once(registry, 'listening')
const registryUrl = `http://127.0.0.1:${registry.address().port}`
const npmEnv = {
  npm_config_cache: join(staging, 'lock-npm-cache'),
  npm_config_registry: registryUrl,
  npm_config_replace_registry_host: 'never',
  XDG_CACHE_HOME: join(staging, 'deferred-cli-cache'),
}

try {
  await execa('pnpm', ['build:cli'], {cwd: root, stdio: 'inherit'})
  for (const name of [
    '@sanity/cli-core',
    '@sanity/cli-setup',
    '@sanity/cli-build',
    '@sanity/workbench-cli',
  ])
    await pack(name)
  await pack('@sanity/cli')
  await pack('create-sanity', {lock: true})

  const args = process.argv.slice(process.argv[2] === '--' ? 3 : 2)
  if (args.length > 0) {
    await runInitializer(args)
  } else {
    console.log(`Preview registry: ${registryUrl}`)
    console.log('Run from an empty directory in a second terminal:')
    console.log(
      `XDG_CACHE_HOME=${JSON.stringify(npmEnv.XDG_CACHE_HOME)} npm_config_registry=${registryUrl} npm_config_replace_registry_host=never npm_config_cache="$(mktemp -d)" npm create --yes sanity@blueprints -- --with-blueprints --yes --project "$PROJECT_ID" --dataset production`,
    )
    console.log('Press Ctrl-C to stop the preview registry.')
    await Promise.race([once(process, 'SIGINT'), once(process, 'SIGTERM')])
  }
} finally {
  registry.close()
  await rm(staging, {force: true, recursive: true})
}

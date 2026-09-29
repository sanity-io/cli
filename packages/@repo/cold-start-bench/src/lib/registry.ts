import {createWriteStream} from 'node:fs'
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {createServer} from 'node:net'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'

import {execa, type ResultPromise} from 'execa'

import {benchVersion, isBenchVersion, rewriteManifest} from './manifest.ts'
import {type PackedPackage} from './pack.ts'
import {repackTarball} from './tarball.ts'

/**
 * Verdaccio config for a local mirror of npm.
 *
 * A package's metadata is fetched from npm once and then kept for ten years, so
 * repeated runs resolve the same dependency versions and the score only moves
 * when the code does. Packages npm hasn't seen before are still fetched.
 */
export function registryConfig(storage: string): string {
  return [
    `storage: ${JSON.stringify(storage)}`,
    'max_body_size: 500mb',
    'uplinks:',
    '  npmjs:',
    '    url: https://registry.npmjs.org/',
    '    maxage: 3650d',
    '    timeout: 60s',
    'packages:',
    "  '**':",
    '    access: $all',
    '    publish: $anonymous',
    '    proxy: npmjs',
    'web:',
    '  enable: false',
    'log: {type: stdout, format: pretty, level: warn}',
    '',
  ].join('\n')
}

export interface Registry {
  port: number
  stop(): Promise<void>
  url: string
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        address && typeof address !== 'string' ? resolve(address.port) : reject(new Error('no port')),
      )
    })
  })
}

async function waitForPing(url: string, child: ResultPromise, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let exited = false
  child.finally(() => (exited = true)).catch(() => {})
  while (Date.now() < deadline) {
    if (exited) throw new Error('Verdaccio exited during startup; see verdaccio.log')
    try {
      if ((await fetch(`${url}-/ping`)).ok) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Verdaccio did not start within ${timeoutMs}ms`)
}

/**
 * Starts verdaccio in its own process, so its work doesn't share an event loop
 * with the throttle proxy and the pty reader.
 */
export async function startRegistry(stateDir: string): Promise<Registry> {
  const dir = join(stateDir, 'registry')
  await mkdir(join(dir, 'storage'), {recursive: true})
  const configPath = join(dir, 'config.yaml')
  await writeFile(configPath, registryConfig(join(dir, 'storage')))

  const require = createRequire(import.meta.url)
  const bin = join(dirname(require.resolve('verdaccio/package.json')), 'bin', 'verdaccio')
  const port = await freePort()
  const url = `http://127.0.0.1:${port}/`
  const log = createWriteStream(join(dir, 'verdaccio.log'), {flags: 'a'})
  const child = execa(process.execPath, [bin, '--config', configPath, '--listen', `127.0.0.1:${port}`], {
    reject: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.pipe(log)
  child.stderr?.pipe(log)

  await waitForPing(url, child, 30_000)
  return {
    port,
    async stop() {
      child.kill()
      await child
      log.end()
    },
    url,
  }
}

/** npm settings for talking to the local registry, without the user's own config */
export async function npmEnv(registryUrl: string, dir: string): Promise<Record<string, string>> {
  const userconfig = join(dir, 'npmrc')
  const host = registryUrl.replace(/^https?:/, '')
  await writeFile(userconfig, `${host}:_authToken=cold-start-bench\n`)
  return {
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    npm_config_registry: registryUrl,
    npm_config_update_notifier: 'false',
    npm_config_userconfig: userconfig,
  }
}

export async function publish(file: string, env: Record<string, string>): Promise<void> {
  const result = await execa('npm', ['publish', file, '--tag', 'cold-start-bench'], {
    env,
    reject: false,
  })
  if (result.exitCode === 0) return
  // Content-addressed versions: an existing version is the same package
  if (/EPUBLISHCONFLICT|cannot publish over|this package is already present/i.test(result.stderr)) return
  throw new Error(`npm publish ${file} failed:\n${result.stderr}`)
}

/**
 * Takes the published `sanity` package and points its CLI dependencies at the
 * bench versions, so `npx sanity init` runs the CLI under test inside the
 * `sanity` package users actually get.
 */
export async function wrapSanity(options: {
  cli: readonly PackedPackage[]
  env: Record<string, string>
  id: string
  outDir: string
  sanityVersion: string
}): Promise<PackedPackage> {
  const {cli, env, id, outDir, sanityVersion} = options
  const dir = await mkdtemp(join(tmpdir(), 'cold-start-sanity-'))
  try {
    const {stdout} = await execa('npm', ['pack', `sanity@${sanityVersion}`, '--json'], {
      cwd: dir,
      env: {...env, npm_config_cache: join(dir, '.npm')},
    })
    const [{filename}] = JSON.parse(stdout) as {filename: string}[]
    const version = benchVersion(sanityVersion, id)
    const versions = new Map(cli.map((p) => [p.name, p.version]))
    const file = join(outDir, `sanity-${version}.tgz`)
    const manifest = await repackTarball(join(dir, filename), file, (m) =>
      rewriteManifest(m, version, versions),
    )
    if (!Object.values(manifest.dependencies ?? {}).some((range) => isBenchVersion(range))) {
      throw new Error(`sanity@${sanityVersion} has no dependency on the packed CLI packages`)
    }
    return {file, name: 'sanity', version}
  } finally {
    await rm(dir, {force: true, recursive: true})
  }
}

/**
 * Installs a package once, unthrottled, so every tarball and piece of metadata
 * it needs is in the registry's storage before anything is timed.
 */
export async function seed(spec: string, env: Record<string, string>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'cold-start-seed-'))
  try {
    await writeFile(join(dir, 'package.json'), '{"private": true}')
    await execa('npm', ['install', spec, '--ignore-scripts', '--no-package-lock'], {
      cwd: dir,
      env: {...env, npm_config_cache: join(dir, '.npm')},
    })
  } finally {
    await rm(dir, {force: true, recursive: true})
  }
}

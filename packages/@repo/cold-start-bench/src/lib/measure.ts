import {existsSync} from 'node:fs'
import {chmod, mkdir, readdir, rm} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'

import * as pty from 'node-pty'

import {type RunResult} from './compare.ts'
import {type EntryPoint} from './config.ts'
import {analyzeOutput, type OutputChunk, visibleText} from './output.ts'
import {scanInstalledTree} from './tree.ts'

/**
 * The command a new user types. `--yes` answers npm's "Need to install the
 * following packages" prompt, so a human's reaction time isn't measured.
 * `latest` resolves to the variant under test; see `filter.ts`.
 */
export function entryCommand(entry: EntryPoint): [string, string[]] {
  switch (entry) {
    case 'npm-create-sanity': {
      return ['npm', ['create', '--yes', 'sanity@latest']]
    }
    case 'npx-sanity-init': {
      return ['npx', ['--yes', 'sanity@latest', 'init']]
    }
  }
}

/**
 * pnpm installs node-pty's prebuilt `spawn-helper` without the execute bit on
 * macOS, and every spawn then fails with `posix_spawnp failed`.
 */
export async function ensureSpawnHelperExecutable(): Promise<void> {
  const root = dirname(createRequire(import.meta.url).resolve('node-pty/package.json'))
  const prebuilds = join(root, 'prebuilds')
  if (!existsSync(prebuilds)) return
  for (const platform of await readdir(prebuilds)) {
    const helper = join(prebuilds, platform, 'spawn-helper')
    if (existsSync(helper)) await chmod(helper, 0o755)
  }
}

/**
 * A minimal environment for a first-time user: nothing inherited that could
 * change npm or CLI behavior (CI flags, tokens, npm config, proxies).
 */
export function cleanEnv(options: {dir: string; registryUrl: string}): Record<string, string> {
  const {dir, registryUrl} = options
  const env: Record<string, string> = {
    HOME: join(dir, 'home'),
    LANG: 'en_US.UTF-8',
    npm_config_cache: join(dir, 'npm-cache'),
    // An empty global prefix, so a globally installed `sanity` can't be picked up
    npm_config_prefix: join(dir, 'global'),
    npm_config_registry: registryUrl,
    npm_config_update_notifier: 'false',
    npm_config_userconfig: join(dir, 'home', '.npmrc'),
    PATH: process.env.PATH ?? '',
    TERM: 'xterm-256color',
    XDG_CONFIG_HOME: join(dir, 'home', '.config'),
  }
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR
  if (process.env.SYSTEMROOT) env.SYSTEMROOT = process.env.SYSTEMROOT
  return env
}

async function findNpxTree(cacheDir: string): Promise<string | null> {
  const npx = join(cacheDir, '_npx')
  if (!existsSync(npx)) return null
  for (const hash of await readdir(npx)) {
    const nodeModules = join(npx, hash, 'node_modules')
    if (existsSync(nodeModules)) return nodeModules
  }
  return null
}

/**
 * Runs one entry point from scratch and records when the CLI's first output
 * and the marker appeared. The process is killed once the marker shows up.
 */
export async function measureRun(options: {
  dir: string
  entry: EntryPoint
  marker: RegExp
  registryUrl: string
  scanTree: boolean
  timeoutMs: number
}): Promise<Omit<
    RunResult,
    'modeledDownloadMs' | 'run' | 'variant' | 'wireBytesDown' | 'wireBytesUp' | 'wireConnections' | 'wireRequests'
  >> {
  const {dir, entry, marker, registryUrl, scanTree, timeoutMs} = options
  await rm(dir, {force: true, recursive: true})
  const project = join(dir, 'project')
  await mkdir(project, {recursive: true})
  await mkdir(join(dir, 'home'), {recursive: true})

  const env = cleanEnv({dir, registryUrl})
  const [command, args] = entryCommand(entry)
  const chunks: OutputChunk[] = []

  const started = performance.now()
  const child = pty.spawn(command, args, {cols: 100, cwd: project, env, name: 'xterm-256color', rows: 40})

  let exited = false
  const exit = new Promise<void>((resolve) =>
    child.onExit(() => {
      exited = true
      resolve()
    }),
  )

  const end = await new Promise<RunResult['end']>((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), timeoutMs)
    child.onData((data) => {
      chunks.push({at: performance.now() - started, data})
      if (analyzeOutput(chunks, marker).markerAt !== null) {
        clearTimeout(timer)
        resolve('marker')
      }
    })
    void exit.then(() => {
      clearTimeout(timer)
      resolve('exited')
    })
  })

  if (!exited) {
    try {
      // npx runs the CLI as a grandchild; kill the whole process group
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // already gone
    }
    await Promise.race([exit, new Promise((resolve) => setTimeout(resolve, 5000))])
  }

  const timeline = analyzeOutput(chunks, marker)
  const nodeModules = scanTree ? await findNpxTree(env.npm_config_cache) : null
  const tree = nodeModules ? await scanInstalledTree(nodeModules) : null
  // A detached child (the CLI's telemetry flush) can still be writing to the
  // home directory for a moment after the process group is killed
  await rm(dir, {force: true, maxRetries: 10, recursive: true, retryDelay: 200})

  return {
    end,
    entry,
    firstOutputMs: timeline.firstOutputAt === null ? null : Math.round(timeline.firstOutputAt),
    firstScreen: timeline.firstScreen,
    // What the user saw, for runs that went wrong
    ...(end === 'marker' ? {} : {output: visibleText(chunks).slice(-4000)}),
    markerMs: timeline.markerAt === null ? null : Math.round(timeline.markerAt),
    tree,
  }
}

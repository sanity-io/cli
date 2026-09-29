import {existsSync} from 'node:fs'
import {chmod, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeAll, beforeEach, describe, expect, test} from 'vitest'

import {cleanEnv, ensureSpawnHelperExecutable, entryCommand, measureRun} from '../measure.ts'

describe('entryCommand', () => {
  test('npx sanity init', () => {
    expect(entryCommand('npx-sanity-init')).toEqual([
      'npx',
      ['--yes', 'sanity@latest', 'init'],
    ])
  })

  test('npm create sanity', () => {
    expect(entryCommand('npm-create-sanity')).toEqual([
      'npm',
      ['create', '--yes', 'sanity@latest'],
    ])
  })
})

describe('cleanEnv', () => {
  test('points npm and home at the run directory and drops everything else', () => {
    const original = {CI: process.env.CI, SANITY_AUTH_TOKEN: process.env.SANITY_AUTH_TOKEN}
    process.env.CI = 'true'
    process.env.SANITY_AUTH_TOKEN = 'secret'
    try {
      const env = cleanEnv({dir: '/runs/1', registryUrl: 'http://127.0.0.1:9/'})
      expect(env).toMatchObject({
        HOME: '/runs/1/home',
        npm_config_cache: '/runs/1/npm-cache',
        npm_config_prefix: '/runs/1/global',
        npm_config_registry: 'http://127.0.0.1:9/',
        npm_config_userconfig: '/runs/1/home/.npmrc',
        XDG_CONFIG_HOME: '/runs/1/home/.config',
      })
      expect(env).not.toHaveProperty('CI')
      expect(env).not.toHaveProperty('SANITY_AUTH_TOKEN')
    } finally {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})

describe('ensureSpawnHelperExecutable', () => {
  test('runs without error', async () => {
    await expect(ensureSpawnHelperExecutable()).resolves.toBeUndefined()
  })
})

describe('measureRun', () => {
  let bin: string
  let originalPath: string | undefined

  beforeAll(async () => {
    await ensureSpawnHelperExecutable()
  })

  beforeEach(async () => {
    bin = await mkdtemp(join(tmpdir(), 'cold-start-bin-'))
    originalPath = process.env.PATH
    process.env.PATH = `${bin}:${process.env.PATH}`
  })

  afterEach(async () => {
    process.env.PATH = originalPath
    await rm(bin, {force: true, recursive: true})
  })

  // Stands in for npx: an npm-style spinner and warning, then CLI output
  async function fakeNpx(script: string) {
    const path = join(bin, 'npx')
    await writeFile(path, `#!/bin/sh\n${script}\n`)
    await chmod(path, 0o755)
  }

  async function run(overrides: Partial<Parameters<typeof measureRun>[0]> = {}) {
    const dir = join(bin, 'run')
    return measureRun({
      dir,
      entry: 'npx-sanity-init',
      marker: /Fetching providers/,
      registryUrl: 'http://127.0.0.1:9/',
      scanTree: true,
      timeoutMs: 10_000,
      ...overrides,
    })
  }

  test('times first output and the marker, then stops the process', async () => {
    await fakeNpx(String.raw`
mkdir -p "$npm_config_cache/_npx/abc/node_modules/pkg"
echo '{"name":"pkg","version":"1.0.0"}' > "$npm_config_cache/_npx/abc/node_modules/pkg/package.json"
printf '\342\240\213'
sleep 0.2
echo 'npm warn deprecated x@1'
sleep 0.2
echo 'Welcome'
sleep 0.2
echo 'Fetching providers...'
sleep 30`)

    const started = performance.now()
    const result = await run()
    expect(performance.now() - started).toBeLessThan(8000)
    expect(result.end).toBe('marker')
    expect(result.firstOutputMs).toBeGreaterThanOrEqual(350)
    expect(result.markerMs! - result.firstOutputMs!).toBeGreaterThanOrEqual(150)
    expect(result.firstScreen).toBe('Welcome\nFetching providers...')
    expect(result.tree?.packageCount).toBe(1)
    expect(existsSync(join(bin, 'run'))).toBe(false)
  })

  test('reports a process that exits without the marker', async () => {
    await fakeNpx('echo "npm error 404 Not Found"; exit 1')
    const result = await run({scanTree: false})
    expect(result).toMatchObject({
      end: 'exited',
      firstOutputMs: null,
      markerMs: null,
      output: 'npm error 404 Not Found\n',
      tree: null,
    })
  })

  test('gives up after the timeout', async () => {
    await fakeNpx('echo Welcome; sleep 30')
    const result = await run({timeoutMs: 500})
    expect(result).toMatchObject({end: 'timeout', markerMs: null, tree: null})
    expect(result.firstOutputMs).not.toBeNull()
  })
})

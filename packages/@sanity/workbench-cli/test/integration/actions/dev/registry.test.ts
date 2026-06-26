import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {__resetStartTimeCacheForTesting} from '../../../../src/actions/dev/processLiveness.js'
import {
  type DevServerManifest,
  getRegisteredServers,
  registerDevServer,
  watchRegistry,
} from '../../../../src/actions/dev/registry.js'

const mockExecSync = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}))

// Mock getSanityDataDir to use a temp directory per test
let testDataDir: string

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    getSanityDataDir: () => testDataDir,
  }
})

/** Derives the registry path the same way the module does internally. */
function registryDir() {
  return join(testDataDir, 'dev-servers')
}

beforeEach(() => {
  testDataDir = join(tmpdir(), `sanity-registry-test-${process.pid}-${Date.now()}`)
  mkdirSync(testDataDir, {recursive: true})
  // By default, return a start time matching "now" so our own PID passes isOurProcess
  mockExecSync.mockReturnValue(new Date().toString())
  __resetStartTimeCacheForTesting()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('registerDevServer', () => {
  test('writes a manifest file and returns a cleanup function', (t) => {
    const {release: cleanup} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: '/tmp/project',
    })
    // Guarantee the manifest is removed even if an assertion below throws.
    t.onTestFinished(() => cleanup())

    const filePath = join(registryDir(), `${process.pid}.json`)
    expect(existsSync(filePath)).toBe(true)

    const manifest = JSON.parse(readFileSync(filePath, 'utf8'))
    expect(manifest.pid).toBe(process.pid)
    expect(manifest.type).toBe('studio')
    expect(manifest.port).toBe(3334)
    expect(manifest.host).toBe('localhost')
    expect(manifest.workDir).toBe('/tmp/project')
    expect(manifest.startedAt).toBeDefined()
    expect(manifest.version).toBe(1)

    cleanup()
    expect(existsSync(filePath)).toBe(false)
  })

  test('persists id in the manifest when provided', () => {
    const {release: cleanup} = registerDevServer({
      host: 'localhost',
      id: 'app-abc',
      port: 3334,
      type: 'coreApp',
      workDir: '/tmp/project',
    })

    const manifest = JSON.parse(readFileSync(join(registryDir(), `${process.pid}.json`), 'utf8'))
    expect(manifest.id).toBe('app-abc')

    cleanup()
  })

  test('persists projectId in the manifest when provided', () => {
    const {release: cleanup} = registerDevServer({
      host: 'localhost',
      port: 3334,
      projectId: 'x1g7jygt',
      type: 'studio',
      workDir: '/tmp/project',
    })

    const manifest = JSON.parse(readFileSync(join(registryDir(), `${process.pid}.json`), 'utf8'))
    expect(manifest.projectId).toBe('x1g7jygt')

    const servers = getRegisteredServers()
    expect(servers).toHaveLength(1)
    expect(servers[0].projectId).toBe('x1g7jygt')

    cleanup()
  })

  test('omits optional metadata when not provided and retains manifest through getRegisteredServers', () => {
    const {release: cleanup} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: '/tmp/project',
    })

    const manifest = JSON.parse(readFileSync(join(registryDir(), `${process.pid}.json`), 'utf8'))
    expect(manifest.id).toBeUndefined()
    expect(manifest.manifest).toBeUndefined()

    const servers = getRegisteredServers()
    expect(servers).toHaveLength(1)
    expect(servers[0].id).toBeUndefined()
    expect(servers[0].manifest).toBeUndefined()

    cleanup()
  })

  test('update inlines the extracted manifest into the registry entry', () => {
    const {release: cleanup, update} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: '/tmp/project',
    })

    const inlined = {createdAt: '2026-01-01T00:00:00.000Z', version: 3, workspaces: []}
    update({manifest: inlined, manifestUpdatedAt: '2026-01-01T00:00:00.000Z'})

    const servers = getRegisteredServers()
    expect(servers[0].manifest).toEqual(inlined)
    expect(servers[0].manifestUpdatedAt).toBe('2026-01-01T00:00:00.000Z')

    cleanup()
  })

  test('cleanup does not throw if file already removed', () => {
    const {release: cleanup} = registerDevServer({
      host: 'localhost',
      port: 3333,
      type: 'studio',
      workDir: '/tmp/project',
    })

    cleanup()
    expect(() => cleanup()).not.toThrow()
  })

  test('update after release is a no-op — late background extractions do not re-create the file', () => {
    const {release: cleanup, update} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: '/tmp/project',
    })

    const filePath = join(registryDir(), `${process.pid}.json`)
    cleanup()
    expect(existsSync(filePath)).toBe(false)

    // Simulate a background extraction completing after release.
    update({
      manifest: {createdAt: '2026-01-01T00:00:00.000Z', version: 3, workspaces: []},
      manifestUpdatedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(existsSync(filePath)).toBe(false)
  })
})

describe('watchRegistry', () => {
  test('invokes callback when a manifest file is added', async (t) => {
    const callback = vi.fn()
    const watcher = watchRegistry(callback)
    t.onTestFinished(() => watcher.close())

    const dir = registryDir()
    const manifest: DevServerManifest = {
      host: 'localhost',
      pid: process.pid,
      port: 5555,
      startedAt: new Date().toISOString(),
      type: 'studio',
      version: 1,
      workDir: '/tmp/watch-test',
    }
    writeFileSync(join(dir, `${process.pid}.json`), JSON.stringify(manifest))

    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(callback).toHaveBeenCalled()
    const servers = callback.mock.calls.at(-1)![0]
    expect(servers.some((s: DevServerManifest) => s.port === 5555)).toBe(true)
  })

  test('close stops notifications', async () => {
    const callback = vi.fn()
    const watcher = watchRegistry(callback)
    watcher.close()

    const dir = registryDir()
    writeFileSync(
      join(dir, 'after-close.json'),
      JSON.stringify({
        host: 'localhost',
        pid: process.pid,
        port: 6666,
        startedAt: new Date().toISOString(),
        type: 'studio',
        version: 1,
        workDir: '/tmp/closed',
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(callback).not.toHaveBeenCalled()
  })
})

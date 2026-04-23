import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  acquireWorkbenchLock,
  type DevServerManifest,
  getRegisteredServers,
  readWorkbenchLock,
  registerDevServer,
  watchRegistry,
} from '../devServerRegistry.js'

const mockExecSync = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}))

// Mock getSanityConfigDir to use a temp directory per test
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
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('registerDevServer', () => {
  test('writes a manifest file and returns a cleanup function', () => {
    const {release: cleanup} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: '/tmp/project',
    })

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
})

describe('acquireWorkbenchLock', () => {
  test('returns lock object when lock is available', () => {
    const lock = acquireWorkbenchLock({host: 'localhost', port: 3333})
    expect(lock).toBeDefined()
    expect(lock!.release).toBeTypeOf('function')
    expect(lock!.updatePort).toBeTypeOf('function')
    lock!.release()
  })

  test('returns undefined when lock is already held by a live process', () => {
    const lock = acquireWorkbenchLock({host: 'localhost', port: 3333})
    expect(lock).toBeDefined()

    const second = acquireWorkbenchLock({host: 'localhost', port: 3333})
    expect(second).toBeUndefined()

    lock!.release()
  })

  test('release removes the lock file', () => {
    const lock = acquireWorkbenchLock({host: 'localhost', port: 3333})
    lock!.release()

    const second = acquireWorkbenchLock({host: 'localhost', port: 3333})
    expect(second).toBeDefined()
    second!.release()
  })

  test('stores host, port, startedAt and version in the lock file', () => {
    const lock = acquireWorkbenchLock({host: '0.0.0.0', port: 4000})

    const lockPath = join(registryDir(), 'workbench.lock')
    const data = JSON.parse(readFileSync(lockPath, 'utf8'))
    expect(data.host).toBe('0.0.0.0')
    expect(data.port).toBe(4000)
    expect(data.pid).toBe(process.pid)
    expect(data.startedAt).toBeDefined()
    expect(data.version).toBe(1)

    lock!.release()
  })

  test('updatePort writes the new port to the lock file', () => {
    const lock = acquireWorkbenchLock({host: 'localhost', port: 3333})
    lock!.updatePort(3334)

    const lockPath = join(registryDir(), 'workbench.lock')
    const data = JSON.parse(readFileSync(lockPath, 'utf8'))
    expect(data.port).toBe(3334)

    lock!.release()
  })

  test('reclaims stale lock from a dead process', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    writeFileSync(
      join(dir, 'workbench.lock'),
      JSON.stringify({
        host: 'localhost',
        pid: 99_999_999,
        port: 3333,
        startedAt: new Date().toISOString(),
        version: 1,
      }),
      {flag: 'wx'},
    )

    const lock = acquireWorkbenchLock({host: 'localhost', port: 3333})
    expect(lock).toBeDefined()
    lock!.release()
  })

  test('returns undefined after exhausting retries', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    // Write a lock that will fail schema validation (missing required fields),
    // causing readWorkbenchLock to return undefined without pruning the file.
    // With retries=0, the function should not recurse.
    writeFileSync(join(dir, 'workbench.lock'), JSON.stringify({host: 'localhost', pid: 1, port: 1}))

    const lock = acquireWorkbenchLock({host: 'localhost', port: 3333}, 0)
    expect(lock).toBeUndefined()
  })
})

describe('readWorkbenchLock', () => {
  test('returns undefined when no lock file exists', () => {
    expect(readWorkbenchLock()).toBeUndefined()
  })

  test('returns lock data when lock is held by a live process', () => {
    const lock = acquireWorkbenchLock({host: '0.0.0.0', port: 4000})

    const data = readWorkbenchLock()
    expect(data).toBeDefined()
    expect(data!.host).toBe('0.0.0.0')
    expect(data!.port).toBe(4000)
    expect(data!.pid).toBe(process.pid)

    lock!.release()
  })

  test('prunes stale lock and returns undefined', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    const lockPath = join(dir, 'workbench.lock')
    writeFileSync(
      lockPath,
      JSON.stringify({
        host: 'localhost',
        pid: 99_999_999,
        port: 3333,
        startedAt: new Date().toISOString(),
        version: 1,
      }),
    )

    expect(readWorkbenchLock()).toBeUndefined()
    expect(existsSync(lockPath)).toBe(false)
  })
})

describe('PID-reuse detection', () => {
  test('prunes manifest when PID is alive but start time does not match', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    // Write a manifest for the current PID but with a startedAt far in the past
    const staleManifest: DevServerManifest = {
      host: 'localhost',
      pid: process.pid,
      port: 9999,
      startedAt: new Date('2020-01-01T00:00:00Z').toISOString(),
      type: 'studio',
      version: 1,
      workDir: '/tmp/stale-project',
    }
    writeFileSync(join(dir, `${process.pid}.json`), JSON.stringify(staleManifest))

    // Mock ps to return a different (current) start time
    mockExecSync.mockReturnValue(new Date().toString())

    const servers = getRegisteredServers()
    expect(servers).toHaveLength(0)
    expect(existsSync(join(dir, `${process.pid}.json`))).toBe(false)
  })

  test('keeps manifest when PID is alive and start time matches', () => {
    const now = new Date()
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    const manifest: DevServerManifest = {
      host: 'localhost',
      pid: process.pid,
      port: 9999,
      startedAt: now.toISOString(),
      type: 'studio',
      version: 1,
      workDir: '/tmp/valid-project',
    }
    writeFileSync(join(dir, `${process.pid}.json`), JSON.stringify(manifest))

    // Mock ps to return matching start time
    mockExecSync.mockReturnValue(now.toString())

    const servers = getRegisteredServers()
    expect(servers).toHaveLength(1)
    expect(servers[0].port).toBe(9999)
  })

  test('falls back to alive-check when start time cannot be retrieved', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    const manifest: DevServerManifest = {
      host: 'localhost',
      pid: process.pid,
      port: 9999,
      startedAt: new Date().toISOString(),
      type: 'studio',
      version: 1,
      workDir: '/tmp/fallback-project',
    }
    writeFileSync(join(dir, `${process.pid}.json`), JSON.stringify(manifest))

    // ps fails — should fall back to isProcessAlive (which will be true for our PID)
    mockExecSync.mockImplementation(() => {
      throw new Error('ps not available')
    })

    const servers = getRegisteredServers()
    expect(servers).toHaveLength(1)
  })

  test('prunes workbench lock when PID is reused', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    const lockPath = join(dir, 'workbench.lock')
    writeFileSync(
      lockPath,
      JSON.stringify({
        host: 'localhost',
        pid: process.pid,
        port: 4000,
        startedAt: new Date('2020-01-01T00:00:00Z').toISOString(),
        version: 1,
      }),
    )

    mockExecSync.mockReturnValue(new Date().toString())

    expect(readWorkbenchLock()).toBeUndefined()
    expect(existsSync(lockPath)).toBe(false)
  })
})

describe('startedAt uses OS-reported process start time', () => {
  // Regression: previously `registerDevServer` / `acquireWorkbenchLock` stored
  // `new Date().toISOString()` at call time, but `isOurProcess` compares that
  // value against `ps -o lstart=` with a 2s tolerance. In real `sanity dev`
  // runs, registration happens several seconds after process start (after the
  // workbench + app Vite servers boot), so the drift exceeded the tolerance
  // and manifests were pruned as "stale" the moment the watcher re-read them.

  test('registerDevServer stores the OS-reported start time, not the call time', () => {
    const osStart = new Date('2026-04-17T11:38:10.000Z')
    mockExecSync.mockReturnValue(osStart.toString())

    const {release: cleanup} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: '/tmp/project',
    })

    const manifest = JSON.parse(readFileSync(join(registryDir(), `${process.pid}.json`), 'utf8'))
    // `new Date(osStart.toString())` loses sub-second precision the same way
    // `getProcessStartTime` does, so this is an exact match.
    expect(manifest.startedAt).toBe(new Date(osStart.toString()).toISOString())

    cleanup()
  })

  test('manifest written several seconds after OS process start survives pruning', () => {
    // Simulate reality: the process started 5s ago, registerDevServer is only
    // called now (after the CLI booted its Vite servers). Before the fix, the
    // manifest's startedAt would be "now" and mismatch the ps-reported time
    // by 5s — well past the 2s tolerance — so getRegisteredServers would
    // immediately prune it.
    const osStart = new Date(Date.now() - 5000)
    mockExecSync.mockReturnValue(osStart.toString())

    const {release: cleanup} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: '/tmp/project',
    })

    const servers = getRegisteredServers()
    expect(servers).toHaveLength(1)
    expect(servers[0].port).toBe(3334)
    expect(existsSync(join(registryDir(), `${process.pid}.json`))).toBe(true)

    cleanup()
  })

  test('acquireWorkbenchLock stores the OS-reported start time, not the call time', () => {
    const osStart = new Date('2026-04-17T11:38:10.000Z')
    mockExecSync.mockReturnValue(osStart.toString())

    const lock = acquireWorkbenchLock({host: 'localhost', port: 3333})
    expect(lock).toBeDefined()

    const data = JSON.parse(readFileSync(join(registryDir(), 'workbench.lock'), 'utf8'))
    expect(data.startedAt).toBe(new Date(osStart.toString()).toISOString())

    lock!.release()
  })

  test('lock written several seconds after OS process start survives readWorkbenchLock', () => {
    const osStart = new Date(Date.now() - 5000)
    mockExecSync.mockReturnValue(osStart.toString())

    const lock = acquireWorkbenchLock({host: 'localhost', port: 3333})
    expect(lock).toBeDefined()

    // readWorkbenchLock re-runs isOurProcess — with the fix, the stored
    // startedAt matches the ps-reported time, so the lock is considered live.
    const read = readWorkbenchLock()
    expect(read).toBeDefined()
    expect(read!.port).toBe(3333)

    lock!.release()
  })

  test('falls back to new Date() when ps is unavailable', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('ps not available')
    })

    const before = Date.now()
    const {release: cleanup} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: '/tmp/project',
    })
    const after = Date.now()

    const manifest = JSON.parse(readFileSync(join(registryDir(), `${process.pid}.json`), 'utf8'))
    const storedMs = new Date(manifest.startedAt).getTime()
    expect(storedMs).toBeGreaterThanOrEqual(before)
    expect(storedMs).toBeLessThanOrEqual(after)

    cleanup()
  })
})

describe('watchRegistry', () => {
  test('invokes callback when a manifest file is added', async () => {
    const callback = vi.fn()
    const watcher = watchRegistry(callback)

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

    watcher.close()
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

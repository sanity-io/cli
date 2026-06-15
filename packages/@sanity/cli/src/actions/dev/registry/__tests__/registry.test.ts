import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {__resetStartTimeCacheForTesting} from '../processLiveness.js'
import {
  acquireWorkbenchLock,
  type DevServerManifest,
  getRegisteredServers,
  registerDevServer,
  watchRegistry,
} from '../registry.js'

const mockExecSync = vi.hoisted(() => vi.fn())

// `execSync` backs `getProcessStartTime` (ps / PowerShell). Mocked so a test can
// simulate an OS-reported start time it can't reproduce with a live process —
// a reused PID (mismatched time) or an unavailable ps. The real-OS path runs
// un-mocked in registry.windows.test.ts.
vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}))

// Redirect the registry to a per-test temp directory (path isolation, not
// behaviour mocking) so tests never touch the real `~/.sanity` data dir.
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

/** Claim the workbench lock and assert success, returning the lock handle. */
function acquireOrThrow(info: {host: string; port: number}) {
  const claim = acquireWorkbenchLock(info)
  if (!claim.acquired) throw new Error('expected to acquire the workbench lock')
  return claim.lock
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

describe('acquireWorkbenchLock', () => {
  test('returns a lock handle when the lock is available', () => {
    const lock = acquireOrThrow({host: 'localhost', port: 3333})
    expect(lock.release).toBeTypeOf('function')
    expect(lock.updatePort).toBeTypeOf('function')
    lock.release()
  })

  test('reports the live holder when the lock is already held', () => {
    const lock = acquireOrThrow({host: '0.0.0.0', port: 4000})

    const claim = acquireWorkbenchLock({host: 'localhost', port: 3333})
    expect(claim.acquired).toBe(false)
    if (claim.acquired) throw new Error('expected the claim to fail')
    expect(claim.heldBy).toMatchObject({host: '0.0.0.0', pid: process.pid, port: 4000})

    lock.release()
  })

  test('release frees the lock for the next claim', () => {
    acquireOrThrow({host: 'localhost', port: 3333}).release()
    acquireOrThrow({host: 'localhost', port: 3333}).release()
  })

  test('stores host, port, startedAt and version in the lock file', () => {
    const lock = acquireOrThrow({host: '0.0.0.0', port: 4000})

    const data = JSON.parse(readFileSync(join(registryDir(), 'workbench.lock'), 'utf8'))
    expect(data.host).toBe('0.0.0.0')
    expect(data.port).toBe(4000)
    expect(data.pid).toBe(process.pid)
    expect(data.startedAt).toBeDefined()
    expect(data.version).toBe(1)

    lock.release()
  })

  test('updatePort writes the new port to the lock file', () => {
    const lock = acquireOrThrow({host: 'localhost', port: 3333})
    lock.updatePort(3334)

    const data = JSON.parse(readFileSync(join(registryDir(), 'workbench.lock'), 'utf8'))
    expect(data.port).toBe(3334)

    lock.release()
  })

  test('reclaims a stale lock from a dead process', () => {
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

    acquireOrThrow({host: 'localhost', port: 3333}).release()
  })

  // Regression: a zero-byte lock (crashed writer / `sanity dev` killed mid-write)
  // or an unparsable one used to early-return without pruning, so the next claim
  // hit EEXIST forever and `sanity dev` silently ran no workbench.
  test('reclaims a zero-byte lock', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})
    writeFileSync(join(dir, 'workbench.lock'), '')

    acquireOrThrow({host: 'localhost', port: 3333}).release()
  })

  test('reclaims an unparsable-JSON lock', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})
    writeFileSync(join(dir, 'workbench.lock'), 'not json {{{')

    acquireOrThrow({host: 'localhost', port: 3333}).release()
  })

  test('fails without recursing once retries are exhausted', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})
    // A lock that fails schema validation: the read returns undefined without
    // pruning, so with retries=0 the claim must not recurse.
    writeFileSync(join(dir, 'workbench.lock'), JSON.stringify({host: 'localhost', pid: 1, port: 1}))

    const claim = acquireWorkbenchLock({host: 'localhost', port: 3333}, 0)
    expect(claim.acquired).toBe(false)
  })
})

// Liveness behaviour (PID-reuse detection, OS-reported start times, the Windows
// PowerShell path) exercised through the registry's public API — integration by
// design, guarding the plumbing between processLiveness and its consumers.
describe('PID-reuse detection', () => {
  test('prunes manifest when PID is alive but start time does not match', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

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

    // ps fails — should fall back to isProcessAlive (true for our own PID)
    mockExecSync.mockImplementation(() => {
      throw new Error('ps not available')
    })

    const servers = getRegisteredServers()
    expect(servers).toHaveLength(1)
  })

  test('reclaims a workbench lock whose PID was reused', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    writeFileSync(
      join(dir, 'workbench.lock'),
      JSON.stringify({
        host: 'localhost',
        pid: process.pid,
        port: 4000,
        startedAt: new Date('2020-01-01T00:00:00Z').toISOString(),
        version: 1,
      }),
    )

    mockExecSync.mockReturnValue(new Date().toString())

    // Our PID is alive but its OS start time no longer matches the lock's, so
    // the stale lock is pruned and the claim succeeds.
    acquireOrThrow({host: 'localhost', port: 3333}).release()
  })
})

describe('Windows / win32', () => {
  let originalPlatform: NodeJS.Platform

  beforeEach(() => {
    originalPlatform = process.platform
    Object.defineProperty(process, 'platform', {configurable: true, value: 'win32'})
    __resetStartTimeCacheForTesting()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', {configurable: true, value: originalPlatform})
  })

  test('shells out to PowerShell with -NoProfile -NonInteractive', () => {
    mockExecSync.mockReturnValue('2026-04-17T11:38:10.0000000+00:00')

    const {release: cleanup} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: 'C:\\projects\\win',
    })

    expect(mockExecSync).toHaveBeenCalled()
    const cmd = mockExecSync.mock.calls[0][0] as string
    expect(cmd).toMatch(/^powershell\.exe /)
    expect(cmd).toContain('-NoProfile')
    expect(cmd).toContain('-NonInteractive')
    expect(cmd).toContain('Get-CimInstance Win32_Process')
    expect(cmd).toContain(`ProcessId=${process.pid}`)
    expect(cmd).toContain("CreationDate.ToString('o')")

    cleanup()
  })

  test('parses PowerShell ISO 8601 round-trip output', () => {
    const osStart = new Date('2026-04-17T11:38:10.000Z')
    mockExecSync.mockReturnValue('2026-04-17T11:38:10.0000000+00:00')

    const {release: cleanup} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: 'C:\\projects\\win',
    })

    const manifest = JSON.parse(readFileSync(join(registryDir(), `${process.pid}.json`), 'utf8'))
    expect(new Date(manifest.startedAt).getTime()).toBe(osStart.getTime())

    cleanup()
  })

  test('detects PID reuse on Windows (PowerShell start time mismatch)', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    const staleManifest: DevServerManifest = {
      host: 'localhost',
      pid: process.pid,
      port: 9999,
      startedAt: '2020-01-01T00:00:00.000Z',
      type: 'studio',
      version: 1,
      workDir: 'C:\\projects\\stale',
    }
    writeFileSync(join(dir, `${process.pid}.json`), JSON.stringify(staleManifest))

    mockExecSync.mockReturnValue('2026-04-17T11:38:10.0000000+00:00')

    const servers = getRegisteredServers()
    expect(servers).toHaveLength(0)
    expect(existsSync(join(dir, `${process.pid}.json`))).toBe(false)
  })

  test('falls back to alive-check when PowerShell fails (e.g. no PowerShell)', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    const manifest: DevServerManifest = {
      host: 'localhost',
      pid: process.pid,
      port: 9999,
      startedAt: new Date().toISOString(),
      type: 'studio',
      version: 1,
      workDir: 'C:\\projects\\fallback',
    }
    writeFileSync(join(dir, `${process.pid}.json`), JSON.stringify(manifest))

    mockExecSync.mockImplementation(() => {
      throw new Error("'powershell.exe' is not recognized")
    })

    const servers = getRegisteredServers()
    expect(servers).toHaveLength(1)
  })

  test("memoises own PID's start time across calls (avoids repeated PowerShell spawns)", () => {
    mockExecSync.mockReturnValue('2026-04-17T11:38:10.0000000+00:00')

    const {release: cleanup} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: 'C:\\projects\\cache',
    })

    const callsAfterRegistration = mockExecSync.mock.calls.length

    // Each of these recomputes isOurProcess(process.pid, ...) → would
    // shell out again without the cache.
    getRegisteredServers()
    getRegisteredServers()
    getRegisteredServers()

    expect(mockExecSync.mock.calls.length).toBe(callsAfterRegistration)

    cleanup()
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

    const lock = acquireOrThrow({host: 'localhost', port: 3333})

    const data = JSON.parse(readFileSync(join(registryDir(), 'workbench.lock'), 'utf8'))
    expect(data.startedAt).toBe(new Date(osStart.toString()).toISOString())

    lock.release()
  })

  test('a lock written several seconds after OS process start stays live on re-claim', () => {
    const osStart = new Date(Date.now() - 5000)
    mockExecSync.mockReturnValue(osStart.toString())

    const lock = acquireOrThrow({host: 'localhost', port: 3333})

    // A second claim re-runs isOurProcess against the stored startedAt; with the
    // OS-time fix it matches, so the lock reads as live and blocks the claim.
    const claim = acquireWorkbenchLock({host: 'localhost', port: 9999})
    expect(claim.acquired).toBe(false)
    if (claim.acquired) throw new Error('expected the claim to fail')
    expect(claim.heldBy?.port).toBe(3333)

    lock.release()
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

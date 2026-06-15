/**
 * Tests for process-liveness behaviour (PID-reuse detection, OS-reported
 * start times, the Windows PowerShell path) exercised through the registry
 * and workbench-lock public API — these are integration tests by design, so
 * they guard the plumbing between `processLiveness.ts` and its consumers,
 * not just the helpers in isolation.
 */
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {__resetStartTimeCacheForTesting} from '../processLiveness.js'
import {type DevServerManifest, getRegisteredServers, registerDevServer} from '../registry.js'
import {acquireWorkbenchLock, readWorkbenchLock} from '../workbenchLock.js'

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
  vi.unstubAllEnvs()
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

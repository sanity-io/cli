import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {__resetStartTimeCacheForTesting, acquireWorkbenchLock, readWorkbenchLock} from '../index.js'

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
  __resetStartTimeCacheForTesting()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
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

  // Regression: a zero-byte lock (e.g. left behind by a crashed writer or a
  // killed `sanity dev` mid-write) used to early-return undefined without
  // pruning, so the next acquire attempt hit EEXIST forever — `sanity dev`
  // logged "Workbench dev server started at …" while no Vite was actually
  // listening.
  test('prunes zero-byte lock and returns undefined', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    const lockPath = join(dir, 'workbench.lock')
    writeFileSync(lockPath, '')

    expect(readWorkbenchLock()).toBeUndefined()
    expect(existsSync(lockPath)).toBe(false)
  })

  test('prunes unparsable-JSON lock and returns undefined', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    const lockPath = join(dir, 'workbench.lock')
    writeFileSync(lockPath, 'not json {{{')

    expect(readWorkbenchLock()).toBeUndefined()
    expect(existsSync(lockPath)).toBe(false)
  })
})

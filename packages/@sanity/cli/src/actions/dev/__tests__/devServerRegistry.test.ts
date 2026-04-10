import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  acquireWorkbenchLock,
  type DevServerManifest,
  readWorkbenchLock,
  registerDevServer,
  watchRegistry,
} from '../devServerRegistry.js'

// Mock homedir to use a temp directory per test
let testRegistryDir: string

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return {
    ...actual,
    homedir: () => testRegistryDir,
  }
})

/** Derives the registry path the same way the module does internally. */
function registryDir() {
  return join(testRegistryDir, '.sanity', 'dev-servers')
}

beforeEach(() => {
  testRegistryDir = join(tmpdir(), `sanity-registry-test-${process.pid}-${Date.now()}`)
  mkdirSync(testRegistryDir, {recursive: true})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('registerDevServer', () => {
  test('writes a manifest file and returns a cleanup function', () => {
    const cleanup = registerDevServer({
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

    cleanup()
    expect(existsSync(filePath)).toBe(false)
  })

  test('cleanup does not throw if file already removed', () => {
    const cleanup = registerDevServer({
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

  test('stores host and port in the lock file', () => {
    const lock = acquireWorkbenchLock({host: '0.0.0.0', port: 4000})

    const lockPath = join(registryDir(), 'workbench.lock')
    const data = JSON.parse(readFileSync(lockPath, 'utf8'))
    expect(data.host).toBe('0.0.0.0')
    expect(data.port).toBe(4000)
    expect(data.pid).toBe(process.pid)

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
      JSON.stringify({host: 'localhost', pid: 99_999_999, port: 3333}),
      {flag: 'wx'},
    )

    const lock = acquireWorkbenchLock({host: 'localhost', port: 3333})
    expect(lock).toBeDefined()
    lock!.release()
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
    writeFileSync(lockPath, JSON.stringify({host: 'localhost', pid: 99_999_999, port: 3333}))

    expect(readWorkbenchLock()).toBeUndefined()
    expect(existsSync(lockPath)).toBe(false)
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
        workDir: '/tmp/closed',
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(callback).not.toHaveBeenCalled()
  })
})

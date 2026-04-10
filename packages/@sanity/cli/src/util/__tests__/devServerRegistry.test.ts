import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  acquireWorkbenchLock,
  type DevServerManifest,
  findLiveWorkbench,
  getRegisteredServers,
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
      port: 3333,
      type: 'workbench',
      workDir: '/tmp/project',
    })

    const filePath = join(registryDir(), `${process.pid}.json`)
    expect(existsSync(filePath)).toBe(true)

    const manifest: DevServerManifest = JSON.parse(readFileSync(filePath, 'utf8'))
    expect(manifest.pid).toBe(process.pid)
    expect(manifest.type).toBe('workbench')
    expect(manifest.port).toBe(3333)
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
    // Second call should not throw
    expect(() => cleanup()).not.toThrow()
  })

  test('includes projectId when provided', () => {
    const cleanup = registerDevServer({
      host: 'localhost',
      port: 3333,
      projectId: 'proj-123',
      type: 'studio',
      workDir: '/tmp/project',
    })

    const filePath = join(registryDir(), `${process.pid}.json`)
    const manifest: DevServerManifest = JSON.parse(readFileSync(filePath, 'utf8'))
    expect(manifest.projectId).toBe('proj-123')

    cleanup()
  })
})

describe('getRegisteredServers', () => {
  test('returns empty array when registry dir does not exist', () => {
    // Use a non-existent homedir
    testRegistryDir = join(tmpdir(), `sanity-nonexistent-${Date.now()}`)
    expect(getRegisteredServers()).toEqual([])
  })

  test('returns live server manifests', () => {
    const cleanup = registerDevServer({
      host: 'localhost',
      port: 3333,
      type: 'workbench',
      workDir: '/tmp/project',
    })

    const servers = getRegisteredServers()
    expect(servers).toHaveLength(1)
    expect(servers[0].pid).toBe(process.pid)
    expect(servers[0].type).toBe('workbench')

    cleanup()
  })

  test('prunes stale manifests for dead PIDs', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    // Write a manifest with a dead PID
    const staleManifest: DevServerManifest = {
      host: 'localhost',
      pid: 99_999_999,
      port: 4444,
      startedAt: new Date().toISOString(),
      type: 'studio',
      workDir: '/tmp/stale-project',
    }
    const stalePath = join(dir, '99999999.json')
    writeFileSync(stalePath, JSON.stringify(staleManifest))

    const servers = getRegisteredServers()
    expect(servers).toHaveLength(0)
    expect(existsSync(stalePath)).toBe(false)
  })

  test('skips corrupt JSON files', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    writeFileSync(join(dir, 'corrupt.json'), 'not valid json{{{')

    expect(() => getRegisteredServers()).not.toThrow()
    expect(getRegisteredServers()).toEqual([])
  })

  test('skips files that fail schema validation', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    writeFileSync(join(dir, 'bad-schema.json'), JSON.stringify({pid: 'not-a-number'}))

    expect(getRegisteredServers()).toEqual([])
  })
})

describe('findLiveWorkbench', () => {
  test('returns undefined when no workbench is registered', () => {
    expect(findLiveWorkbench()).toBeUndefined()
  })

  test('returns the live workbench manifest', () => {
    const cleanup = registerDevServer({
      host: 'localhost',
      port: 3333,
      type: 'workbench',
      workDir: '/tmp/project',
    })

    const workbench = findLiveWorkbench()
    expect(workbench).toBeDefined()
    expect(workbench!.type).toBe('workbench')
    expect(workbench!.pid).toBe(process.pid)

    cleanup()
  })

  test('ignores non-workbench servers', () => {
    const cleanup = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: '/tmp/project',
    })

    expect(findLiveWorkbench()).toBeUndefined()

    cleanup()
  })
})

describe('acquireWorkbenchLock', () => {
  test('returns a release function when lock is available', () => {
    const release = acquireWorkbenchLock()
    expect(release).toBeTypeOf('function')
    release!()
  })

  test('returns undefined when lock is already held by a live process', () => {
    const release = acquireWorkbenchLock()
    expect(release).toBeDefined()

    // Second attempt should fail
    const second = acquireWorkbenchLock()
    expect(second).toBeUndefined()

    release!()
  })

  test('release function removes the lock file', () => {
    const release = acquireWorkbenchLock()
    release!()

    // Lock is released — can acquire again
    const second = acquireWorkbenchLock()
    expect(second).toBeDefined()
    second!()
  })

  test('reclaims stale lock from a dead process', () => {
    const dir = registryDir()
    mkdirSync(dir, {recursive: true})

    // Write a lock file with a dead PID
    writeFileSync(join(dir, 'workbench.lock'), '99999999', {flag: 'wx'})

    // Should reclaim the stale lock
    const release = acquireWorkbenchLock()
    expect(release).toBeDefined()
    release!()
  })
})

describe('watchRegistry', () => {
  test('invokes callback when a manifest file is added', async () => {
    const callback = vi.fn()
    const watcher = watchRegistry(callback)

    // Write a manifest to trigger the watcher
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

    // Wait for debounce (50ms) + buffer
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(callback).toHaveBeenCalled()
    const servers = callback.mock.calls.at(-1)![0]
    expect(servers.some((s: DevServerManifest) => s.port === 5555)).toBe(true)

    watcher.close()
  })

  test('close stops notifications', async () => {
    const callback = vi.fn()
    const watcher = watchRegistry(callback)
    watcher.close()

    // Write a manifest after closing — should not trigger callback
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

    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(callback).not.toHaveBeenCalled()
  })
})

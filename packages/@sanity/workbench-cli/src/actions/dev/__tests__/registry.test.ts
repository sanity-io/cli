import {join} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {
  acquireWorkbenchLock,
  type DevServerManifest,
  getRegisteredServers,
  readWorkbenchLock,
  registerDevServer,
  watchRegistry,
} from '../registry.js'
import {FakeFsWatcher} from './devTestHelpers.js'

// An in-memory stand-in for the small slice of `node:fs` the registry uses, so
// these stay unit tests with no real disk I/O. It models just enough: absolute
// posix paths, the `wx` exclusive-create flag the lock relies on, and ENOENT on
// missing reads/unlinks.
const fsMock = vi.hoisted(() => {
  const files = new Map<string, string>()
  const dirs = new Set<string>()

  return {
    dirs,
    files,
    module: {
      existsSync: (p: string) => files.has(p) || dirs.has(p),
      mkdirSync: (p: string) => dirs.add(p),
      // `path.join` yields backslash separators on Windows, so match on either.
      readdirSync: (p: string) =>
        [...files.keys()]
          .filter((f) => f.slice(0, Math.max(f.lastIndexOf('/'), f.lastIndexOf('\\'))) === p)
          .map((f) => f.slice(p.length + 1)),
      readFileSync: (p: string) => {
        if (!files.has(p)) throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
        return files.get(p)
      },
      realpathSync: {native: (p: string) => p},
      unlinkSync: (p: string) => {
        if (!files.has(p)) throw Object.assign(new Error('ENOENT'), {code: 'ENOENT'})
        files.delete(p)
      },
      watch: vi.fn(),
      writeFileSync: vi.fn((p: string, data: string, opts?: {flag?: string}) => {
        if (opts?.flag?.includes('x') && files.has(p)) {
          throw Object.assign(new Error('EEXIST'), {code: 'EEXIST'})
        }
        files.set(p, data)
      }),
    },
    reset() {
      files.clear()
      dirs.clear()
    },
  }
})

vi.mock('node:fs', () => fsMock.module)

const mockGetSanityDataDir = vi.hoisted(() => vi.fn())
vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getSanityDataDir: mockGetSanityDataDir,
}))

// The registry's liveness/PID-reuse logic is exercised in processLiveness.test.ts.
// Here it is a mocked seam so tests drive the keep/prune decision directly.
const mockIsOurProcess = vi.hoisted(() => vi.fn())
const mockGetProcessStartTime = vi.hoisted(() => vi.fn())
vi.mock('../processLiveness.js', () => ({
  __resetStartTimeCacheForTesting: vi.fn(),
  getProcessStartTime: mockGetProcessStartTime,
  isOurProcess: mockIsOurProcess,
}))

const DATA_DIR = '/tmp/sanity-data'
const REGISTRY_DIR = join(DATA_DIR, 'dev-servers')
const OS_START = new Date('2026-04-17T11:38:10.000Z')

const manifestPath = () => join(REGISTRY_DIR, `${process.pid}.json`)
const lockPath = () => join(REGISTRY_DIR, 'workbench.lock')
const readJson = (path: string) => JSON.parse(fsMock.files.get(path)!)

const liveManifest = (port: number): DevServerManifest => ({
  host: 'localhost',
  pid: process.pid,
  port,
  startedAt: OS_START.toISOString(),
  type: 'studio',
  version: 1,
  workDir: '/tmp/watch',
})

let fakeWatcher: FakeFsWatcher

beforeEach(() => {
  fsMock.reset()
  fakeWatcher = new FakeFsWatcher()
  fsMock.module.watch.mockImplementation((_dir: string, listener: FakeFsWatcher['handler']) => {
    fakeWatcher.handler = listener
    return fakeWatcher
  })
  mockGetSanityDataDir.mockReturnValue(DATA_DIR)
  // Live entries belong to our own PID; any foreign PID reads as dead.
  mockIsOurProcess.mockImplementation((pid: number) => pid === process.pid)
  mockGetProcessStartTime.mockReturnValue(OS_START)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('registerDevServer', () => {
  test('writes a manifest file and removes it on release', () => {
    const {release} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: '/tmp/project',
    })

    expect(fsMock.module.existsSync(manifestPath())).toBe(true)
    const manifest = readJson(manifestPath())
    expect(manifest).toMatchObject({
      host: 'localhost',
      pid: process.pid,
      port: 3334,
      type: 'studio',
      version: 1,
      workDir: '/tmp/project',
    })

    release()
    expect(fsMock.module.existsSync(manifestPath())).toBe(false)
  })

  test('persists id and projectId when provided', () => {
    registerDevServer({
      host: 'localhost',
      id: 'app-abc',
      port: 3334,
      projectId: 'x1g7jygt',
      type: 'coreApp',
      workDir: '/tmp/project',
    })

    expect(readJson(manifestPath())).toMatchObject({id: 'app-abc', projectId: 'x1g7jygt'})
    expect(getRegisteredServers()[0]).toMatchObject({id: 'app-abc', projectId: 'x1g7jygt'})
  })

  test('omits optional metadata when not provided', () => {
    registerDevServer({host: 'localhost', port: 3334, type: 'studio', workDir: '/tmp/project'})

    const [server] = getRegisteredServers()
    expect(server.id).toBeUndefined()
    expect(server.manifest).toBeUndefined()
  })

  test('update inlines the extracted manifest into the registry entry', () => {
    const {update} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: '/tmp/project',
    })

    const inlined = {createdAt: '2026-01-01T00:00:00.000Z', version: 3, workspaces: []}
    update({manifest: inlined, manifestUpdatedAt: '2026-01-01T00:00:00.000Z'})

    const [server] = getRegisteredServers()
    expect(server.manifest).toEqual(inlined)
    expect(server.manifestUpdatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  test('release is idempotent and a late update after release does not re-create the file', () => {
    const {release, update} = registerDevServer({
      host: 'localhost',
      port: 3334,
      type: 'studio',
      workDir: '/tmp/project',
    })

    release()
    expect(() => release()).not.toThrow()

    // A background extraction completing after release must not resurrect the entry.
    update({manifest: {createdAt: '2026-01-01T00:00:00.000Z', version: 3, workspaces: []}})
    expect(fsMock.module.existsSync(manifestPath())).toBe(false)
  })

  test('stores the OS-reported start time rather than the write time', () => {
    registerDevServer({host: 'localhost', port: 3334, type: 'studio', workDir: '/tmp/project'})

    expect(readJson(manifestPath()).startedAt).toBe(OS_START.toISOString())
  })

  test('falls back to the current time when the OS start time is unavailable', () => {
    mockGetProcessStartTime.mockReturnValue(undefined)

    const before = Date.now()
    registerDevServer({host: 'localhost', port: 3334, type: 'studio', workDir: '/tmp/project'})
    const storedMs = new Date(readJson(manifestPath()).startedAt).getTime()

    expect(storedMs).toBeGreaterThanOrEqual(before)
    expect(storedMs).toBeLessThanOrEqual(Date.now())
  })
})

describe('getRegisteredServers', () => {
  test('returns an empty list when the registry directory does not exist', () => {
    expect(getRegisteredServers()).toEqual([])
  })

  test('prunes entries whose owning process is gone', () => {
    registerDevServer({host: 'localhost', port: 3334, type: 'studio', workDir: '/tmp/project'})
    mockIsOurProcess.mockReturnValue(false)

    expect(getRegisteredServers()).toEqual([])
    expect(fsMock.module.existsSync(manifestPath())).toBe(false)
  })

  test('skips unparsable and wrong-shape files without pruning them, keeping the valid ones', () => {
    registerDevServer({host: 'localhost', port: 3334, type: 'studio', workDir: '/tmp/project'})
    fsMock.files.set(join(REGISTRY_DIR, 'garbage.json'), 'not json {{{')
    fsMock.files.set(join(REGISTRY_DIR, 'wrong-shape.json'), JSON.stringify({nope: true}))

    expect(getRegisteredServers()).toHaveLength(1)
    // Malformed files are ignored, not deleted — another writer may own them.
    expect(fsMock.files.has(join(REGISTRY_DIR, 'garbage.json'))).toBe(true)
    expect(fsMock.files.has(join(REGISTRY_DIR, 'wrong-shape.json'))).toBe(true)
  })
})

describe('watchRegistry', () => {
  test('debounces filesystem events and reports the live servers', () => {
    const callback = vi.fn()
    watchRegistry(callback)

    fsMock.files.set(manifestPath(), JSON.stringify(liveManifest(5555)))
    fakeWatcher.emitChange('anything.json')
    // Nothing fires until the debounce window elapses.
    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(50)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toEqual([liveManifest(5555)])
  })

  test('close stops further notifications', () => {
    const callback = vi.fn()
    const watcher = watchRegistry(callback)
    watcher.close()

    fsMock.files.set(manifestPath(), JSON.stringify(liveManifest(6666)))
    fakeWatcher.emitChange('anything.json')
    vi.advanceTimersByTime(50)

    expect(callback).not.toHaveBeenCalled()
  })
})

describe('acquireWorkbenchLock', () => {
  test('acquires an available lock and stores its metadata', () => {
    const lock = acquireWorkbenchLock({host: '0.0.0.0', port: 4000})

    expect(lock).toBeDefined()
    expect(readJson(lockPath())).toMatchObject({
      host: '0.0.0.0',
      pid: process.pid,
      port: 4000,
      startedAt: OS_START.toISOString(),
      version: 1,
    })
  })

  test('returns undefined when a live process already holds the lock', () => {
    acquireWorkbenchLock({host: 'localhost', port: 3333})
    expect(acquireWorkbenchLock({host: 'localhost', port: 3333})).toBeUndefined()
  })

  test('release frees the lock for the next acquirer', () => {
    const lock = acquireWorkbenchLock({host: 'localhost', port: 3333})
    lock!.release()

    expect(acquireWorkbenchLock({host: 'localhost', port: 3333})).toBeDefined()
  })

  test('updatePort rewrites the port in the lock file', () => {
    const lock = acquireWorkbenchLock({host: 'localhost', port: 3333})
    lock!.updatePort(3334)

    expect(readJson(lockPath()).port).toBe(3334)
  })

  test('reclaims a stale lock left by a dead process', () => {
    fsMock.files.set(
      lockPath(),
      JSON.stringify({host: 'localhost', pid: 99_999_999, port: 3333, startedAt: '', version: 1}),
    )

    expect(acquireWorkbenchLock({host: 'localhost', port: 3333})).toBeDefined()
  })

  test('returns undefined when the lock write fails for a reason other than an existing lock', () => {
    fsMock.module.writeFileSync.mockImplementationOnce(() => {
      throw Object.assign(new Error('permission denied'), {code: 'EACCES'})
    })

    expect(acquireWorkbenchLock({host: 'localhost', port: 3333})).toBeUndefined()
  })

  test('returns undefined without recursing once retries are exhausted', () => {
    // A schema-invalid lock is pruned on read but never reveals a live holder,
    // so with retries=0 the call must not loop forever.
    fsMock.files.set(lockPath(), JSON.stringify({host: 'localhost', pid: 1, port: 1}))

    expect(acquireWorkbenchLock({host: 'localhost', port: 3333}, 0)).toBeUndefined()
  })
})

describe('readWorkbenchLock', () => {
  test('returns undefined when no lock file exists', () => {
    expect(readWorkbenchLock()).toBeUndefined()
  })

  test('returns the lock when its holder is alive', () => {
    acquireWorkbenchLock({host: '0.0.0.0', port: 4000})

    expect(readWorkbenchLock()).toMatchObject({host: '0.0.0.0', pid: process.pid, port: 4000})
  })

  test.each([
    [
      'a dead holder',
      JSON.stringify({host: 'x', pid: 99_999_999, port: 1, startedAt: '', version: 1}),
    ],
    ['a zero-byte file', ''],
    ['unparsable JSON', 'not json {{{'],
  ])('prunes the lock and returns undefined for %s', (_label, contents) => {
    fsMock.files.set(lockPath(), contents)

    expect(readWorkbenchLock()).toBeUndefined()
    expect(fsMock.module.existsSync(lockPath())).toBe(false)
  })
})

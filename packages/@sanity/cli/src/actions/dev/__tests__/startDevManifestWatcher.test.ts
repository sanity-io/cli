import {EventEmitter} from 'node:events'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {startDevManifestWatcher} from '../startDevManifestWatcher.js'
import {createMockOutput} from './testHelpers.js'

const mockExtractManifest = vi.hoisted(() => vi.fn())
const mockFindProjectRoot = vi.hoisted(() => vi.fn())
const mockFsWatch = vi.hoisted(() => vi.fn())

vi.mock('../../manifest/extractManifest.js', () => ({
  extractManifest: mockExtractManifest,
}))

vi.mock('@sanity/cli-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {
    ...actual,
    findProjectRoot: mockFindProjectRoot,
  }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    watch: mockFsWatch,
  }
})

/** Fake FSWatcher that exposes helpers for simulating events in tests. */
// eslint-disable-next-line unicorn/prefer-event-target -- mirrors node's FSWatcher which extends EventEmitter
class FakeFsWatcher extends EventEmitter {
  public closed = false
  public handler: ((event: string, filename: string | null) => void) | undefined

  close() {
    this.closed = true
  }

  emitChange(filename: string | null) {
    this.handler?.('change', filename)
  }
}

const WORK_DIR = '/tmp/studio'
const CONFIG_PATH = '/tmp/studio/sanity.config.ts'

describe('startDevManifestWatcher', () => {
  let fakeWatcher: FakeFsWatcher

  beforeEach(() => {
    fakeWatcher = new FakeFsWatcher()
    mockFindProjectRoot.mockResolvedValue({
      directory: WORK_DIR,
      path: CONFIG_PATH,
      type: 'studio',
    })
    mockExtractManifest.mockResolvedValue(undefined)
    mockFsWatch.mockImplementation((_dir: string, listener: FakeFsWatcher['handler']) => {
      fakeWatcher.handler = listener
      return fakeWatcher
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  test('performs an initial extraction and updates registry with manifestPath', async () => {
    const update = vi.fn()

    const watcher = await startDevManifestWatcher({
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })

    expect(mockExtractManifest).toHaveBeenCalledWith({
      outPath: `${WORK_DIR}/node_modules/.sanity/manifest`,
      path: CONFIG_PATH,
      workDir: WORK_DIR,
    })
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        manifestPath: `${WORK_DIR}/node_modules/.sanity/manifest/create-manifest.json`,
        manifestUpdatedAt: expect.any(String),
      }),
    )

    await watcher.close()
  })

  test('re-extracts after a debounced config file change', async () => {
    const update = vi.fn()
    const watcher = await startDevManifestWatcher({
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })

    expect(mockExtractManifest).toHaveBeenCalledTimes(1)

    // Fire multiple rapid "change" events — should coalesce into a single
    // regeneration after the debounce window.
    fakeWatcher.emitChange('sanity.config.ts')
    fakeWatcher.emitChange('sanity.config.ts')
    fakeWatcher.emitChange('sanity.config.ts')

    await vi.advanceTimersByTimeAsync(300)

    expect(mockExtractManifest).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(2)

    await watcher.close()
  })

  test('ignores changes to other files in the config directory', async () => {
    const update = vi.fn()
    const watcher = await startDevManifestWatcher({
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })

    expect(mockExtractManifest).toHaveBeenCalledTimes(1)

    fakeWatcher.emitChange('unrelated.ts')
    fakeWatcher.emitChange('package.json')

    await vi.advanceTimersByTimeAsync(300)

    expect(mockExtractManifest).toHaveBeenCalledTimes(1)

    await watcher.close()
  })

  test('logs a warning and keeps running when extraction fails', async () => {
    const output = createMockOutput()
    const update = vi.fn()
    mockExtractManifest
      .mockRejectedValueOnce(new Error('bad schema'))
      .mockResolvedValueOnce(undefined)

    const watcher = await startDevManifestWatcher({output, update, workDir: WORK_DIR})

    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('bad schema'))
    // Failed extraction must not call update — we only touch the registry
    // when a manifest actually exists at the expected path.
    expect(update).not.toHaveBeenCalled()

    // A subsequent change triggers a successful regeneration that updates the
    // registry as normal.
    fakeWatcher.emitChange('sanity.config.ts')
    await vi.advanceTimersByTimeAsync(300)

    expect(update).toHaveBeenCalledTimes(1)

    await watcher.close()
  })

  test('stops regenerating after close', async () => {
    const update = vi.fn()
    const watcher = await startDevManifestWatcher({
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })

    expect(mockExtractManifest).toHaveBeenCalledTimes(1)

    await watcher.close()

    expect(fakeWatcher.closed).toBe(true)

    fakeWatcher.emitChange('sanity.config.ts')
    await vi.advanceTimersByTimeAsync(300)

    expect(mockExtractManifest).toHaveBeenCalledTimes(1)
  })
})

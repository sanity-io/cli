import {EventEmitter} from 'node:events'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {startDevManifestWatcher} from '../startDevManifestWatcher.js'
import {createMockOutput} from './testHelpers.js'

const mockExtractStudioManifest = vi.hoisted(() => vi.fn())
const mockFindProjectRoot = vi.hoisted(() => vi.fn())
const mockFsWatch = vi.hoisted(() => vi.fn())

vi.mock('../extractDevServerManifest.js', () => ({
  extractStudioManifest: mockExtractStudioManifest,
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
const STUDIO_CONFIG_PATH = '/tmp/studio/sanity.config.ts'

describe('startDevManifestWatcher', () => {
  let fakeWatcher: FakeFsWatcher
  const studioManifest = {createdAt: '2026-01-01', version: 3, workspaces: []}

  beforeEach(() => {
    fakeWatcher = new FakeFsWatcher()
    mockFindProjectRoot.mockResolvedValue({
      directory: WORK_DIR,
      path: STUDIO_CONFIG_PATH,
      type: 'studio',
    })
    mockExtractStudioManifest.mockResolvedValue(studioManifest)
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

  test('runs an initial extraction on startup and inlines it into update', async () => {
    const update = vi.fn()

    const watcher = await startDevManifestWatcher({
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })

    // Flush the fire-and-forget microtask chain so the initial extraction
    // has time to resolve and patch the registry.
    await vi.advanceTimersByTimeAsync(0)

    expect(mockExtractStudioManifest).toHaveBeenCalledTimes(1)
    expect(mockExtractStudioManifest).toHaveBeenCalledWith({
      configPath: STUDIO_CONFIG_PATH,
      workDir: WORK_DIR,
    })
    expect(update).toHaveBeenCalledWith({
      manifest: studioManifest,
      manifestUpdatedAt: expect.any(String),
    })

    await watcher.close()
  })

  test('coalesces a config-file change that fires during the initial extraction', async () => {
    // Block the first extraction until we say otherwise. This simulates the
    // user editing sanity.config.ts while the worker is still producing the
    // initial manifest — the watcher must not run a parallel extraction.
    let resolveFirst: ((value: typeof studioManifest) => void) | undefined
    mockExtractStudioManifest
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
      )
      .mockResolvedValueOnce(studioManifest)

    const update = vi.fn()
    const watcher = await startDevManifestWatcher({
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })

    // Fire a change event while the initial extraction is still in-flight.
    fakeWatcher.emitChange('sanity.config.ts')
    await vi.advanceTimersByTimeAsync(300)

    // Only the initial extraction is running — the config change is pending.
    expect(mockExtractStudioManifest).toHaveBeenCalledTimes(1)

    // Release the initial extraction; the pending change-triggered run now
    // starts, serialized behind it.
    resolveFirst!(studioManifest)
    await vi.advanceTimersByTimeAsync(0)

    expect(mockExtractStudioManifest).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(2)

    await watcher.close()
  })

  test('re-extracts and inlines the new manifest after a debounced config file change', async () => {
    const update = vi.fn()
    const watcher = await startDevManifestWatcher({
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })

    // Wait for the initial extraction to complete before exercising the
    // file-change path.
    await vi.advanceTimersByTimeAsync(0)
    expect(mockExtractStudioManifest).toHaveBeenCalledTimes(1)

    // Fire multiple rapid "change" events — should coalesce into a single
    // regeneration after the debounce window.
    fakeWatcher.emitChange('sanity.config.ts')
    fakeWatcher.emitChange('sanity.config.ts')
    fakeWatcher.emitChange('sanity.config.ts')

    await vi.advanceTimersByTimeAsync(300)

    expect(mockExtractStudioManifest).toHaveBeenCalledTimes(2)
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

    await vi.advanceTimersByTimeAsync(0)
    expect(mockExtractStudioManifest).toHaveBeenCalledTimes(1)

    fakeWatcher.emitChange('unrelated.ts')
    fakeWatcher.emitChange('package.json')

    await vi.advanceTimersByTimeAsync(300)

    expect(mockExtractStudioManifest).toHaveBeenCalledTimes(1)

    await watcher.close()
  })

  test('logs a warning and keeps running when extraction fails', async () => {
    const output = createMockOutput()
    const update = vi.fn()
    mockExtractStudioManifest
      .mockRejectedValueOnce(new Error('bad schema'))
      .mockResolvedValueOnce(studioManifest)

    const watcher = await startDevManifestWatcher({output, update, workDir: WORK_DIR})

    // The initial extraction fails.
    await vi.advanceTimersByTimeAsync(0)
    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('bad schema'))
    expect(update).not.toHaveBeenCalled()

    // A subsequent change recovers and updates as normal.
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

    await vi.advanceTimersByTimeAsync(0)
    expect(mockExtractStudioManifest).toHaveBeenCalledTimes(1)

    await watcher.close()
    expect(fakeWatcher.closed).toBe(true)

    fakeWatcher.emitChange('sanity.config.ts')
    await vi.advanceTimersByTimeAsync(300)

    expect(mockExtractStudioManifest).toHaveBeenCalledTimes(1)
  })
})

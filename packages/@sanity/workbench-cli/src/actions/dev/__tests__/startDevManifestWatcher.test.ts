import {createMockOutput} from '@sanity/cli-test/test/util'
import {afterEach, beforeEach, describe, expect, type Mock, test, vi} from 'vitest'

import {startDevManifestWatcher} from '../startDevManifestWatcher.js'
import {FakeFsWatcher} from './devTestHelpers.js'

const mockFindProjectRoot = vi.hoisted(() => vi.fn())
const mockFsWatch = vi.hoisted(() => vi.fn())

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

const WORK_DIR = '/tmp/studio'
const STUDIO_CONFIG_PATH = '/tmp/studio/sanity.config.ts'

describe('startDevManifestWatcher', () => {
  let fakeWatcher: FakeFsWatcher
  let mockExtract: Mock<
    (params: {configPath: string; workDir: string}) => Promise<{
      interfaces?: {entry_point: string; interface_type: string; name: string}[] | undefined
      manifest: unknown
    }>
  >
  const studioManifest = {createdAt: '2026-01-01', version: 3, workspaces: []}

  beforeEach(() => {
    fakeWatcher = new FakeFsWatcher()
    mockExtract = vi.fn(async () => ({interfaces: undefined, manifest: studioManifest}))
    mockFindProjectRoot.mockResolvedValue({
      directory: WORK_DIR,
      path: STUDIO_CONFIG_PATH,
      type: 'studio',
    })
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
      extract: mockExtract,
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })

    // Flush the fire-and-forget microtask chain so the initial extraction
    // has time to resolve and patch the registry.
    await vi.advanceTimersByTimeAsync(0)

    expect(mockExtract).toHaveBeenCalledTimes(1)
    expect(mockExtract).toHaveBeenCalledWith({
      configPath: STUDIO_CONFIG_PATH,
      workDir: WORK_DIR,
    })
    expect(update).toHaveBeenCalledWith({
      interfaces: undefined,
      manifest: studioManifest,
      manifestUpdatedAt: expect.any(String),
    })

    await watcher.close()
  })

  test('coalesces a config-file change that fires during the initial extraction', async () => {
    // Block the first extraction until we say otherwise. This simulates the
    // user editing sanity.config.ts while the worker is still producing the
    // initial manifest — the watcher must not run a parallel extraction.
    let resolveFirst:
      | ((value: {interfaces: undefined; manifest: typeof studioManifest}) => void)
      | undefined
    mockExtract
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        }),
      )
      .mockResolvedValueOnce({interfaces: undefined, manifest: studioManifest})

    const update = vi.fn()
    const watcher = await startDevManifestWatcher({
      extract: mockExtract,
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })

    // Fire a change event while the initial extraction is still in-flight.
    fakeWatcher.emitChange('sanity.config.ts')
    await vi.advanceTimersByTimeAsync(300)

    // Only the initial extraction is running — the config change is pending.
    expect(mockExtract).toHaveBeenCalledTimes(1)

    // Release the initial extraction; the pending change-triggered run now
    // starts, serialized behind it.
    resolveFirst!({interfaces: undefined, manifest: studioManifest})
    await vi.advanceTimersByTimeAsync(0)

    expect(mockExtract).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(2)

    await watcher.close()
  })

  test('re-extracts and inlines the new manifest after a debounced config file change', async (t) => {
    const update = vi.fn()
    const watcher = await startDevManifestWatcher({
      extract: mockExtract,
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })
    // Close even if an assertion below throws, so the watcher never leaks.
    t.onTestFinished(() => watcher.close())

    // Wait for the initial extraction to complete before exercising the
    // file-change path.
    await vi.advanceTimersByTimeAsync(0)
    expect(mockExtract).toHaveBeenCalledTimes(1)

    // Fire multiple rapid "change" events — should coalesce into a single
    // regeneration after the debounce window.
    fakeWatcher.emitChange('sanity.config.ts')
    fakeWatcher.emitChange('sanity.config.ts')
    fakeWatcher.emitChange('sanity.config.ts')

    await vi.advanceTimersByTimeAsync(300)

    expect(mockExtract).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(2)
  })

  test('ignores changes to other files in the config directory', async () => {
    const update = vi.fn()
    const watcher = await startDevManifestWatcher({
      extract: mockExtract,
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(mockExtract).toHaveBeenCalledTimes(1)

    fakeWatcher.emitChange('unrelated.ts')
    fakeWatcher.emitChange('package.json')

    await vi.advanceTimersByTimeAsync(300)

    expect(mockExtract).toHaveBeenCalledTimes(1)

    await watcher.close()
  })

  test('regenerates on extraWatchFilenames events too', async () => {
    const update = vi.fn()
    const watcher = await startDevManifestWatcher({
      extract: mockExtract,
      // A studio's project root resolves to sanity.config.ts, but its
      // workbench interfaces live in sanity.cli.ts — both must regenerate.
      extraWatchFilenames: ['sanity.cli.js', 'sanity.cli.ts'],
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(mockExtract).toHaveBeenCalledTimes(1)

    fakeWatcher.emitChange('sanity.cli.ts')
    await vi.advanceTimersByTimeAsync(300)
    expect(mockExtract).toHaveBeenCalledTimes(2)

    // The resolved config file keeps working alongside the extras.
    fakeWatcher.emitChange('sanity.config.ts')
    await vi.advanceTimersByTimeAsync(300)
    expect(mockExtract).toHaveBeenCalledTimes(3)

    // Unrelated files are still ignored.
    fakeWatcher.emitChange('package.json')
    await vi.advanceTimersByTimeAsync(300)
    expect(mockExtract).toHaveBeenCalledTimes(3)

    await watcher.close()
  })

  test('logs a warning and keeps running when extraction fails', async () => {
    const output = createMockOutput()
    const update = vi.fn()
    mockExtract
      .mockRejectedValueOnce(new Error('bad schema'))
      .mockResolvedValueOnce({interfaces: undefined, manifest: studioManifest})

    const watcher = await startDevManifestWatcher({
      extract: mockExtract,
      output,
      update,
      workDir: WORK_DIR,
    })

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
      extract: mockExtract,
      output: createMockOutput(),
      update,
      workDir: WORK_DIR,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(mockExtract).toHaveBeenCalledTimes(1)

    await watcher.close()
    expect(fakeWatcher.closed).toBe(true)

    fakeWatcher.emitChange('sanity.config.ts')
    await vi.advanceTimersByTimeAsync(300)

    expect(mockExtract).toHaveBeenCalledTimes(1)
  })

  test('watches sanity.cli.ts for app projects', async () => {
    const APP_WORK_DIR = '/tmp/sdk-app'
    const APP_CONFIG_PATH = '/tmp/sdk-app/sanity.cli.ts'
    const appManifest = {icon: '<svg/>', title: 'My App', version: '1'}
    // Interfaces ride alongside the manifest (not inside it) and re-sync on
    // every config edit.
    const appInterfaces = [
      {entry_point: './src/FeedPanel.tsx', interface_type: 'panel', name: 'feed'},
    ]
    mockFindProjectRoot.mockResolvedValue({
      directory: APP_WORK_DIR,
      path: APP_CONFIG_PATH,
      type: 'app',
    })
    mockExtract.mockResolvedValue({interfaces: appInterfaces, manifest: appManifest})
    const update = vi.fn()

    const watcher = await startDevManifestWatcher({
      extract: mockExtract,
      output: createMockOutput(),
      update,
      workDir: APP_WORK_DIR,
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(mockExtract).toHaveBeenCalledWith({
      configPath: APP_CONFIG_PATH,
      workDir: APP_WORK_DIR,
    })
    expect(update).toHaveBeenCalledWith({
      interfaces: appInterfaces,
      manifest: appManifest,
      manifestUpdatedAt: expect.any(String),
    })

    // sanity.config.ts is not the app's config — should be ignored.
    fakeWatcher.emitChange('sanity.config.ts')
    await vi.advanceTimersByTimeAsync(300)
    expect(mockExtract).toHaveBeenCalledTimes(1)

    // sanity.cli.ts saves trigger regeneration.
    fakeWatcher.emitChange('sanity.cli.ts')
    await vi.advanceTimersByTimeAsync(300)
    expect(mockExtract).toHaveBeenCalledTimes(2)

    await watcher.close()
  })
})

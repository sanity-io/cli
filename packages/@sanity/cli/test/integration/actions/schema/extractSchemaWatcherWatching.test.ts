import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'

import {type Output} from '@sanity/cli-core'
import {testFixture} from '@sanity/cli-test'
import {type FSWatcher} from 'chokidar'
import {afterEach, describe, expect, test, vi} from 'vitest'

import {startExtractSchemaWatcher} from '../../../../src/actions/schema/extractSchemaWatcher.js'

// Deliberately does not mock chokidar. The sibling suite does, which is why it kept passing while
// the watcher watched nothing: every pattern was handed to chokidar as a literal path, and
// chokidar 4 and later do not expand globs. These tests assert that an edit reaches the watcher.

const mockStudioWorkerTask = vi.hoisted(() => vi.fn())

vi.mock('@sanity/cli-core/tasks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core')>()
  return {...actual, studioWorkerTask: mockStudioWorkerTask}
})

vi.mock('@sanity/cli-core/ux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sanity/cli-core/ux')>()
  return {
    ...actual,
    spinner: vi.fn(() => ({
      fail: vi.fn(),
      start: vi.fn().mockReturnThis(),
      succeed: vi.fn(),
      text: '',
    })),
  }
})

const output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output

const getExtractOptions = (cwd: string, watchPatterns: string[]) => ({
  configPath: join(cwd, 'sanity.config.ts'),
  enforceRequiredFields: false,
  format: 'groq-type-nodes' as const,
  outputPath: join(cwd, 'schema.json'),
  watchPatterns,
  workspace: undefined,
})

/**
 * `startExtractSchemaWatcher` returns before chokidar has finished its initial scan, and an edit
 * written before then is missed. Polling `getWatched()` is not enough: it reports a directory
 * before the watch on it is armed, which drops edits on larger trees. Wait for `ready`.
 */
async function waitUntilReady(watcher: FSWatcher) {
  await new Promise<void>((resolve) => {
    if ((watcher as unknown as {_readyEmitted?: boolean})._readyEmitted) resolve()
    else watcher.once('ready', () => resolve())
  })
}

/** The watcher debounces by 1s, so an edit cannot be observed sooner than that. */
async function waitForExtractions(onExtraction: ReturnType<typeof vi.fn>, count: number) {
  const deadline = Date.now() + 8000
  while (onExtraction.mock.calls.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return onExtraction.mock.calls.length
}

describe('extractSchemaWatcher watching', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('re-extracts when a file matching a glob pattern changes', {timeout: 20_000}, async () => {
    const cwd = await testFixture('basic-studio')
    mockStudioWorkerTask.mockResolvedValue({schema: [], type: 'success'})
    const onExtraction = vi.fn()

    const patterns = ['sanity.config.{js,jsx,ts,tsx,mjs}', 'schema*/**/*.{js,jsx,ts,tsx,mjs}']
    const {close, watcher} = await startExtractSchemaWatcher({
      extractOptions: getExtractOptions(cwd, patterns),
      onExtraction,
      output,
      watchPatterns: patterns,
    })

    // The initial extraction has already run; anything beyond it came from the watcher.
    expect(onExtraction).toHaveBeenCalledTimes(1)
    await waitUntilReady(watcher)
    // The assertion that pins the fix: before it, the globs reduced to nothing and `getWatched()`
    // held only the work directory's parent.
    expect(Object.keys(watcher.getWatched())).toContain('schemaTypes')

    await writeFile(join(cwd, 'schemaTypes', 'post.ts'), '\n// touched by the test\n', {flag: 'a'})
    expect(await waitForExtractions(onExtraction, 2)).toBeGreaterThanOrEqual(2)

    // The other default pattern names a file at the root, whose base is empty.
    await writeFile(join(cwd, 'sanity.config.ts'), '\n// touched by the test\n', {flag: 'a'})
    expect(await waitForExtractions(onExtraction, 3)).toBeGreaterThanOrEqual(3)
    await close()
  })

  test('ignores a file no pattern matches', {timeout: 20_000}, async () => {
    const cwd = await testFixture('basic-studio')
    mockStudioWorkerTask.mockResolvedValue({schema: [], type: 'success'})
    const onExtraction = vi.fn()

    const patterns = ['schema*/**/*.{js,jsx,ts,tsx,mjs}']
    const {close, watcher} = await startExtractSchemaWatcher({
      extractOptions: getExtractOptions(cwd, patterns),
      onExtraction,
      output,
      watchPatterns: patterns,
    })

    await waitUntilReady(watcher)
    await writeFile(join(cwd, 'README.md'), '# not a schema file\n')

    // Long enough for the 1s debounce to have fired if the write had matched.
    await new Promise((resolve) => setTimeout(resolve, 2000))
    expect(onExtraction).toHaveBeenCalledTimes(1)

    // Proves the watcher was live while it ignored the README, rather than watching nothing.
    await writeFile(join(cwd, 'schemaTypes', 'post.ts'), '\n// touched by the test\n', {flag: 'a'})
    expect(await waitForExtractions(onExtraction, 2)).toBeGreaterThanOrEqual(2)
    await close()
  })
})

import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {type TypeGenConfig} from '@sanity/codegen'
import {afterAll, afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type ResolvedResource} from '../generateResourceTypes.js'
import {watchResourceTypes} from '../watchResourceTypes.js'

/** The parts of chokidar's `FSWatcher` that the watcher uses. */
interface FakeWatcher {
  add: (paths: string | string[]) => FakeWatcher
  close: () => Promise<void>
  emit: (event: string, filePath: string) => void
  fail: (error: unknown) => void
  on: (event: string, handler: (...args: never[]) => void) => FakeWatcher
}

const mockWatch = vi.hoisted(() => vi.fn())
const mockGenerateResourceTypes = vi.hoisted(() => vi.fn())

vi.mock(import('chokidar'), async (importOriginal) => ({
  ...(await importOriginal()),
  watch: mockWatch,
}))

vi.mock(import('../generateResourceTypes.js'), () => ({
  generateResourceTypes: mockGenerateResourceTypes,
}))

// A real directory, because the watcher checks that the paths it watches exist.
const workDir = mkdtempSync(path.join(tmpdir(), 'watch-resource-types-'))
for (const directory of [
  ['src', 'queries'],
  ['src', 'shared'],
  ['queries', 'staging'],
]) {
  mkdirSync(path.join(workDir, ...directory), {recursive: true})
}
writeFileSync(path.join(workDir, 'schema.staging.json'), '[]')

const production = {
  dataset: 'production',
  generates: './src/sanity.types.production.ts',
  projectId: 'abc123',
}
const staging = {
  dataset: 'staging',
  generates: './src/sanity.types.staging.ts',
  path: './queries/staging/*.ts',
  projectId: 'abc123',
  schema: './schema.staging.json',
}
const resolved: ResolvedResource[] = [
  {key: 'abc123.production', resource: production, schema: [], schemaVersion: 'v1'},
  {key: 'abc123.staging', resource: staging, schemaPath: './schema.staging.json'},
]

const config: TypeGenConfig = {
  formatGeneratedCode: false,
  generates: './sanity.types.ts',
  overloadClientMethods: false,
  path: './src/**/*.{ts,tsx,js,jsx}',
  schema: './schema.json',
}

let watcher: FakeWatcher

function createFakeWatcher(): FakeWatcher {
  const handlers = new Map<string, (...args: never[]) => void>()
  const fake: FakeWatcher = {
    add: vi.fn(() => fake),
    close: vi.fn().mockResolvedValue(undefined),
    emit: (event, filePath) => {
      const handler = handlers.get('all') as ((event: string, filePath: string) => void) | undefined
      handler?.(event, filePath)
    },
    fail: (error) => {
      const handler = handlers.get('error') as ((error: unknown) => void) | undefined
      handler?.(error)
    },
    on: (event, handler) => {
      handlers.set(event, handler)
      return fake
    },
  }
  return fake
}

/** A promise and the function that resolves it, to hold a generation open. */
function createDeferred<T>(): {promise: Promise<T>; resolve: (value: T) => void} {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {promise, resolve: (value) => resolvePromise?.(value)}
}

function inProject(...segments: string[]): string {
  return path.join(workDir, ...segments)
}

/** The resources passed to each `generateResourceTypes` call, by key. */
function generatedKeys(): string[] {
  return mockGenerateResourceTypes.mock.calls.map(([options]) =>
    options.resolved.map(({key}: ResolvedResource) => key).join(','),
  )
}

/** Starts the watcher and lets the first generation finish. */
async function start(options: Partial<Parameters<typeof watchResourceTypes>[0]> = {}) {
  const started = watchResourceTypes({config, resolved, workDir, ...options})
  await vi.advanceTimersByTimeAsync(0)
  mockGenerateResourceTypes.mockClear()
  return started
}

/** Starts the watcher with each resource's `path` replaced. */
function startWithPaths(
  productionPath: string | string[],
  stagingPath: string | string[],
  options: Partial<Parameters<typeof watchResourceTypes>[0]> = {},
) {
  return start({
    ...options,
    resolved: [
      {...resolved[0], resource: {...production, path: productionPath}},
      {...resolved[1], resource: {...staging, path: stagingPath}},
    ],
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  watcher = createFakeWatcher()
  mockWatch.mockReturnValue(watcher)
  mockGenerateResourceTypes.mockResolvedValue([])
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

afterAll(() => {
  rmSync(workDir, {force: true, recursive: true})
})

describe('watchResourceTypes', () => {
  test('generates each resource on its own at once, without waiting for a change', async () => {
    const onProgress = vi.fn()
    watchResourceTypes({config, onProgress, resolved, workDir})
    await vi.advanceTimersByTimeAsync(0)

    expect(mockGenerateResourceTypes.mock.calls).toEqual([
      [{config, onProgress, resolved: [resolved[0]], workDir}],
      [{config, onProgress, resolved: [resolved[1]], workDir}],
    ])
  })

  test("watches each query pattern's base directory and each local schema file", () => {
    watchResourceTypes({config, resolved, workDir})

    expect(mockWatch).toHaveBeenCalledOnce()
    expect(mockWatch.mock.calls[0][0]).toEqual([
      inProject('src'),
      inProject('queries', 'staging'),
      inProject('schema.staging.json'),
    ])
  })

  test('generates every resource again once query file changes settle', async () => {
    const onChange = vi.fn()
    await start({onChange})

    watcher.emit('change', inProject('src', 'queries.ts'))
    await vi.advanceTimersByTimeAsync(500)
    watcher.emit('add', inProject('queries', 'staging', 'more.ts'))
    await vi.advanceTimersByTimeAsync(999)
    expect(mockGenerateResourceTypes).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(generatedKeys()).toEqual(['abc123.production', 'abc123.staging'])
    expect(onChange.mock.calls).toEqual([
      ['change', 'src/queries.ts'],
      ['add', 'queries/staging/more.ts'],
    ])
  })

  test('generates again when a local schema file changes', async () => {
    await start()

    watcher.emit('change', inProject('schema.staging.json'))
    await vi.advanceTimersByTimeAsync(1000)

    expect(generatedKeys()).toEqual(['abc123.production', 'abc123.staging'])
  })

  test('ignores generated files, files outside the patterns, and directory events', async () => {
    const onChange = vi.fn()
    await start({onChange})

    watcher.emit('change', inProject('src', 'sanity.types.production.ts'))
    watcher.emit('change', inProject('src', 'Sanity.Types.Staging.ts'))
    watcher.emit('change', inProject('src', 'styles.css'))
    watcher.emit('change', inProject('queries', 'production', 'queries.ts'))
    watcher.emit('addDir', inProject('src', 'components.ts'))
    await vi.advanceTimersByTimeAsync(1000)

    expect(onChange).not.toHaveBeenCalled()
    expect(mockGenerateResourceTypes).not.toHaveBeenCalled()
  })

  test('tells chokidar to skip generated files, node_modules and .git', () => {
    watchResourceTypes({config, resolved, workDir})
    const ignored: (filePath: string) => boolean = mockWatch.mock.calls[0][1].ignored

    expect(ignored(inProject('src', 'sanity.types.production.ts'))).toBe(true)
    expect(ignored(inProject('src', 'node_modules'))).toBe(true)
    expect(ignored(inProject('.git'))).toBe(true)
    expect(ignored(inProject('src', 'queries.ts'))).toBe(false)
  })

  describe('query patterns', () => {
    test('a pattern starting with ! excludes files from that resource only', async () => {
      const onChange = vi.fn()
      await startWithPaths(
        ['./src/**/*.ts', '!./src/**/*.test.ts', '!./src/shared/**'],
        ['./src/shared/*.ts'],
        {onChange},
      )
      expect(mockWatch.mock.calls[0][0]).toEqual([
        inProject('src'),
        inProject('src', 'shared'),
        inProject('schema.staging.json'),
      ])

      watcher.emit('change', inProject('src', 'queries.test.ts'))
      watcher.emit('change', inProject('src', 'styles.css'))
      expect(onChange).not.toHaveBeenCalled()

      watcher.emit('change', inProject('src', 'shared', 'queries.ts'))
      watcher.emit('change', inProject('src', 'queries.ts'))
      expect(onChange.mock.calls).toEqual([
        ['change', 'src/shared/queries.ts'],
        ['change', 'src/queries.ts'],
      ])
    })

    test('resolves absolute patterns and . and .. segments against workDir', async () => {
      const onChange = vi.fn()
      await startWithPaths(
        path.join(workDir, 'src', '**', '*.ts'),
        './lib/../queries/staging/*.ts',
        {onChange},
      )
      expect(mockWatch.mock.calls[0][0]).toEqual([
        inProject('src'),
        inProject('queries', 'staging'),
        inProject('schema.staging.json'),
      ])

      watcher.emit('change', inProject('src', 'queries.ts'))
      watcher.emit('change', inProject('queries', 'staging', 'queries.ts'))
      expect(onChange.mock.calls).toEqual([
        ['change', 'src/queries.ts'],
        ['change', 'queries/staging/queries.ts'],
      ])
    })

    test('a pattern starting with ! excludes only from the patterns listed before it', async () => {
      const onChange = vi.fn()
      await startWithPaths(
        ['./src/a/**/*.ts', '!./src/**/*.test.ts', './src/b/**/*.ts'],
        './queries/staging/*.ts',
        {onChange},
      )

      watcher.emit('change', inProject('src', 'a', 'queries.test.ts'))
      watcher.emit('change', inProject('src', 'b', 'queries.test.ts'))

      expect(onChange.mock.calls).toEqual([['change', 'src/b/queries.test.ts']])
    })

    test('a pattern without glob characters also matches the files inside it', async () => {
      const onChange = vi.fn()
      await startWithPaths('./src/queries', './queries/staging/*.ts', {onChange})
      expect(mockWatch.mock.calls[0][0]).toEqual([
        inProject('src', 'queries'),
        inProject('queries', 'staging'),
        inProject('schema.staging.json'),
      ])

      watcher.emit('change', inProject('src', 'queries', 'nested', 'books.ts'))
      watcher.emit('change', inProject('src', 'queries-old.ts'))

      expect(onChange.mock.calls).toEqual([['change', 'src/queries/nested/books.ts']])
    })

    test('skips empty patterns', async () => {
      await startWithPaths(['', './src/**/*.ts'], '!')
      expect(mockWatch.mock.calls[0][0]).toEqual([
        inProject('src'),
        inProject('schema.staging.json'),
      ])
    })

    test('an exclusion without glob characters also excludes the files inside it', async () => {
      const onChange = vi.fn()
      await startWithPaths(['./src/**/*.ts', '!./src/legacy'], './queries/staging/*.ts', {
        onChange,
      })

      watcher.emit('change', inProject('src', 'legacy', 'old.ts'))
      watcher.emit('change', inProject('src', 'new.ts'))

      expect(onChange.mock.calls).toEqual([['change', 'src/new.ts']])
    })

    test('. names workDir and matches every file in it', async () => {
      const onChange = vi.fn()
      await startWithPaths('.', './queries/staging/*.ts', {onChange})
      expect(mockWatch.mock.calls[0][0]).toEqual([
        workDir,
        inProject('queries', 'staging'),
        inProject('schema.staging.json'),
      ])

      watcher.emit('change', inProject('queries.ts'))
      watcher.emit('change', inProject('src', 'nested', 'queries.ts'))

      expect(onChange.mock.calls).toEqual([
        ['change', 'queries.ts'],
        ['change', 'src/nested/queries.ts'],
      ])
    })
  })

  describe('missing and removed paths', () => {
    test('watches a base that is missing at startup once it exists, then generates', async () => {
      await startWithPaths('./apps/web/queries/*.ts', './queries/staging/*.ts')
      try {
        expect(mockWatch.mock.calls[0][0]).toEqual([
          inProject('queries', 'staging'),
          inProject('schema.staging.json'),
        ])
        await vi.advanceTimersByTimeAsync(1000)
        expect(watcher.add).not.toHaveBeenCalled()

        mkdirSync(inProject('apps', 'web', 'queries'), {recursive: true})
        await vi.advanceTimersByTimeAsync(1000)
        expect(watcher.add).toHaveBeenCalledExactlyOnceWith(inProject('apps', 'web', 'queries'))

        await vi.advanceTimersByTimeAsync(1000)
        expect(generatedKeys()).toEqual(['abc123.production', 'abc123.staging'])
      } finally {
        rmSync(inProject('apps'), {force: true, recursive: true})
      }
    })

    test('watches a base removed with its parent again once it exists', async () => {
      await start()
      rmSync(inProject('queries'), {force: true, recursive: true})
      try {
        watcher.emit('unlinkDir', inProject('queries', 'staging'))
        watcher.emit('unlinkDir', inProject('queries'))
        await vi.advanceTimersByTimeAsync(1000)
        expect(watcher.add).not.toHaveBeenCalled()
      } finally {
        mkdirSync(inProject('queries', 'staging'), {recursive: true})
      }

      await vi.advanceTimersByTimeAsync(1000)
      expect(watcher.add).toHaveBeenCalledExactlyOnceWith(inProject('queries', 'staging'))

      await vi.advanceTimersByTimeAsync(1000)
      expect(generatedKeys()).toEqual(['abc123.production', 'abc123.staging'])
    })

    test('watches a base removed and created again between two checks', async () => {
      await start()

      // The directory exists again by the next check.
      watcher.emit('unlinkDir', inProject('queries', 'staging'))
      await vi.advanceTimersByTimeAsync(1000)

      expect(watcher.add).toHaveBeenCalledExactlyOnceWith(inProject('queries', 'staging'))
    })

    test('watches a base again that was removed without an event', async () => {
      // As when chokidar sets up a watch while its directory is being removed, and fails silently.
      await start()
      rmSync(inProject('queries'), {force: true, recursive: true})
      try {
        await vi.advanceTimersByTimeAsync(1000)
      } finally {
        mkdirSync(inProject('queries', 'staging'), {recursive: true})
      }

      await vi.advanceTimersByTimeAsync(1000)
      expect(watcher.add).toHaveBeenCalledExactlyOnceWith(inProject('queries', 'staging'))
    })

    test('watches a removed schema file again', async () => {
      await start()

      watcher.emit('unlink', inProject('schema.staging.json'))
      await vi.advanceTimersByTimeAsync(1000)

      expect(watcher.add).toHaveBeenCalledExactlyOnceWith(inProject('schema.staging.json'))
    })

    test('watches a returned base once more on the next check, then stops adding it', async () => {
      const onChange = vi.fn()
      await start({onChange})

      watcher.emit('unlinkDir', inProject('queries', 'staging'))
      await vi.advanceTimersByTimeAsync(1000)
      expect(onChange.mock.calls).toEqual([['add', 'queries/staging']])

      // In case the first watch was set up while the directory was removed and created again.
      await vi.advanceTimersByTimeAsync(1000)
      await vi.advanceTimersByTimeAsync(1000)
      expect(watcher.add).toHaveBeenCalledTimes(2)
      expect(vi.mocked(watcher.add).mock.calls).toEqual([
        [inProject('queries', 'staging')],
        [inProject('queries', 'staging')],
      ])
    })

    test('does not watch again for other removed files', async () => {
      await start()

      watcher.emit('unlink', inProject('src', 'queries.ts'))
      watcher.emit('unlinkDir', inProject('src', 'components'))
      await vi.advanceTimersByTimeAsync(1000)

      expect(watcher.add).not.toHaveBeenCalled()
    })
  })

  describe('failures', () => {
    test('reports a failed resource and still generates the others', async () => {
      const error = new Error('Failed to generate types for "abc123.production"')
      mockGenerateResourceTypes.mockRejectedValueOnce(error)
      const onError = vi.fn()

      const started = watchResourceTypes({config, onError, resolved, workDir})
      await vi.advanceTimersByTimeAsync(0)

      expect(onError).toHaveBeenCalledExactlyOnceWith(error)
      expect(generatedKeys()).toEqual(['abc123.production', 'abc123.staging'])
      expect(started.getStats()).toMatchObject({
        generationFailedCount: 1,
        generationSuccessfulCount: 1,
      })
    })

    test('keeps watching after a failed run', async () => {
      mockGenerateResourceTypes.mockRejectedValue(new Error('Schema file not found'))
      await start({onError: vi.fn()})
      mockGenerateResourceTypes.mockResolvedValue([])

      watcher.emit('add', inProject('schema.staging.json'))
      await vi.advanceTimersByTimeAsync(1000)

      expect(generatedKeys()).toEqual(['abc123.production', 'abc123.staging'])
    })

    test('reports file watcher errors without counting them as failed generations', async () => {
      const onError = vi.fn()
      const started = await start({onError})

      const cause = new Error('EMFILE: too many open files')
      watcher.fail(cause)

      expect(onError).toHaveBeenCalledOnce()
      const [error] = onError.mock.calls[0]
      expect(error.message).toBe('Watcher error: EMFILE: too many open files')
      expect(error.cause).toBe(cause)
      expect(started.getStats().generationFailedCount).toBe(0)
    })
  })

  test('runs once more after a run during which files changed', async () => {
    const first = createDeferred<[]>()
    mockGenerateResourceTypes.mockImplementationOnce(() => first.promise)
    watchResourceTypes({config, resolved, workDir})

    watcher.emit('change', inProject('src', 'a.ts'))
    await vi.advanceTimersByTimeAsync(1000)
    watcher.emit('change', inProject('src', 'b.ts'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(generatedKeys()).toEqual(['abc123.production'])

    first.resolve([])
    await vi.advanceTimersByTimeAsync(0)
    expect(generatedKeys()).toEqual([
      'abc123.production',
      'abc123.staging',
      'abc123.production',
      'abc123.staging',
    ])
  })

  describe('stop', () => {
    test('closes the watcher and drops a scheduled run', async () => {
      const started = await start()

      watcher.emit('change', inProject('src', 'queries.ts'))
      await started.stop()
      await vi.advanceTimersByTimeAsync(1000)

      expect(watcher.close).toHaveBeenCalledOnce()
      expect(mockGenerateResourceTypes).not.toHaveBeenCalled()
    })

    test('stops checking that watched paths exist', async () => {
      const started = await start()

      watcher.emit('unlinkDir', inProject('queries', 'staging'))
      await started.stop()
      await vi.advanceTimersByTimeAsync(1000)

      expect(watcher.add).not.toHaveBeenCalled()
    })

    test('waits for the resource being generated, then starts nothing else', async () => {
      const first = createDeferred<[]>()
      mockGenerateResourceTypes.mockImplementationOnce(() => first.promise)
      const started = watchResourceTypes({config, resolved, workDir})

      // Queue a follow-up run while the first resource is generating.
      watcher.emit('change', inProject('src', 'a.ts'))
      await vi.advanceTimersByTimeAsync(1000)

      let isStopped = false
      const stopping = started.stop().then(() => {
        isStopped = true
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(isStopped).toBe(false)

      first.resolve([])
      await stopping
      await vi.advanceTimersByTimeAsync(1000)
      expect(generatedKeys()).toEqual(['abc123.production'])
    })
  })
})

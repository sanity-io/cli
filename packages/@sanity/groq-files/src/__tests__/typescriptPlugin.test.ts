import {mkdir, mkdtemp, readdir, readFile, stat, writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {
  type GroqDirectoryWatcher,
  shouldRegenerate,
  startGroqTypeScriptPlugin,
  type WatchGroqDirectories,
} from '../typescriptPlugin.js'
import {SCHEMA} from './exampleProject.js'

const require = createRequire(import.meta.url)
// Resolved so the expectations hold on Windows, where '/app' becomes 'C:\\app'.
const ROOT = resolve('/app')
const at = (...segments: string[]) => join(ROOT, ...segments)

interface FakeWatch {
  closes: number
  factory: WatchGroqDirectories
  fail: (error: Error) => void
  fire: (path: string) => void
  watched: string[][]
}

function fakeWatch(): FakeWatch {
  const state: FakeWatch = {
    closes: 0,
    factory: (directories, onChange, onError) => {
      state.watched.push([...directories])
      state.fire = onChange
      state.fail = onError
      const watcher: GroqDirectoryWatcher = {
        close() {
          state.closes += 1
        },
      }
      return watcher
    },
    fail: () => undefined,
    fire: () => undefined,
    watched: [],
  }
  return state
}

describe('startGroqTypeScriptPlugin', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('generates on start and watches only the directories that matter', async () => {
    const watch = fakeWatch()
    const generate = vi
      .fn()
      .mockResolvedValue([
        at('src', 'queries', 'posts.d.groq.ts'),
        at('src', 'queries', 'a.d.groq.ts'),
      ])
    const plugin = startGroqTypeScriptPlugin({
      directory: ROOT,
      generate,
      schemaPath: 'config/schema.json',
      watch: watch.factory,
    })
    await vi.advanceTimersByTimeAsync(0)

    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate).toHaveBeenCalledWith({
      directory: ROOT,
      schemaPath: at('config', 'schema.json'),
    })
    expect(watch.watched).toEqual([[ROOT, at('config'), at('src', 'queries')]])
    plugin.close()
    expect(watch.closes).toBe(1)
  })

  it('debounces .groq and schema saves and ignores everything else', async () => {
    const watch = fakeWatch()
    const generate = vi.fn().mockResolvedValue([at('posts.d.groq.ts')])
    const logger = {error: vi.fn()}
    const plugin = startGroqTypeScriptPlugin({
      directory: ROOT,
      generate,
      logger,
      watch: watch.factory,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(generate).toHaveBeenCalledTimes(1)

    watch.fire(at('posts.d.groq.ts'))
    watch.fire(at('notes.json'))
    watch.fire(at('node_modules', 'dep', 'schema.json'))
    await vi.advanceTimersByTimeAsync(100)
    expect(generate).toHaveBeenCalledTimes(1)

    watch.fire(at('posts.groq'))
    watch.fire(at('authors.groq'))
    watch.fire(at('schema.json'))
    await vi.advanceTimersByTimeAsync(49)
    expect(generate).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(generate).toHaveBeenCalledTimes(2)
    // The watched set did not change, so the watcher is kept.
    expect(watch.watched).toHaveLength(1)
    expect(watch.closes).toBe(0)

    watch.fail(new Error('inotify limit'))
    expect(logger.error).toHaveBeenCalledWith('inotify limit')

    plugin.close()
    watch.fire(at('posts.groq'))
    await vi.advanceTimersByTimeAsync(100)
    expect(generate).toHaveBeenCalledTimes(2)
    expect(watch.closes).toBe(1)
  })

  it('runs once more after a save that lands while generating, then rewatches new directories', async () => {
    const watch = fakeWatch()
    const slow = Promise.withResolvers<string[]>()
    const generate = vi
      .fn()
      .mockResolvedValueOnce([at('posts.d.groq.ts')])
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce([at('posts.d.groq.ts'), at('more', 'extra.d.groq.ts')])
    const plugin = startGroqTypeScriptPlugin({directory: ROOT, generate, watch: watch.factory})
    await vi.advanceTimersByTimeAsync(0)
    expect(watch.watched).toEqual([[ROOT]])

    watch.fire(at('posts.groq'))
    await vi.advanceTimersByTimeAsync(50)
    expect(generate).toHaveBeenCalledTimes(2)

    // Still generating: this save is remembered instead of overlapping the run.
    watch.fire(at('more', 'extra.groq'))
    await vi.advanceTimersByTimeAsync(50)
    expect(generate).toHaveBeenCalledTimes(2)

    slow.resolve([at('posts.d.groq.ts')])
    await vi.advanceTimersByTimeAsync(0)
    expect(generate).toHaveBeenCalledTimes(3)
    expect(watch.watched).toEqual([[ROOT], [ROOT, at('more')]])
    expect(watch.closes).toBe(1)
    plugin.close()
    expect(watch.closes).toBe(2)
  })

  it('reports generator and watcher setup failures without throwing', async () => {
    const logger = {error: vi.fn()}
    const generate = vi.fn().mockRejectedValueOnce(new Error('bad schema')).mockRejectedValue('x')
    const throwing: WatchGroqDirectories = () => {
      throw new Error('cannot watch')
    }
    const plugin = startGroqTypeScriptPlugin({
      directory: ROOT,
      generate,
      logger,
      watch: throwing,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(logger.error).toHaveBeenCalledWith('bad schema')
    plugin.close()

    const ok = vi.fn().mockResolvedValue([])
    const second = startGroqTypeScriptPlugin({
      directory: ROOT,
      generate: ok,
      logger,
      watch: throwing,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(logger.error).toHaveBeenCalledWith('cannot watch')
    second.close()
  })

  it("runs the generator once per resource folder with that folder's schema", async () => {
    const watch = fakeWatch()
    const generate = vi
      .fn()
      .mockImplementation(({directory}: {directory: string}) =>
        directory === at('src', 'blog')
          ? Promise.resolve([at('src', 'blog', 'posts.d.groq.ts')])
          : Promise.reject(new Error(`no schema for ${directory}`)),
      )
    const logger = {error: vi.fn()}
    const plugin = startGroqTypeScriptPlugin({
      directory: ROOT,
      generate,
      logger,
      resources: [
        {path: 'src/blog', schema: 'schemas/blog.json'},
        {path: ['src/shop', 'src/checkout'], schema: 'schemas/shop.json'},
      ],
      schemaPath: 'ignored.json',
      watch: watch.factory,
    })
    await vi.advanceTimersByTimeAsync(0)

    expect(generate.mock.calls.map(([target]) => target)).toEqual([
      {directory: at('src', 'blog'), schemaPath: at('schemas', 'blog.json')},
      {directory: at('src', 'shop'), schemaPath: at('schemas', 'shop.json')},
      {directory: at('src', 'checkout'), schemaPath: at('schemas', 'shop.json')},
    ])
    // One failing resource is logged; the others are still generated and watched.
    expect(logger.error.mock.calls).toEqual([
      [`no schema for ${at('src', 'shop')}`],
      [`no schema for ${at('src', 'checkout')}`],
    ])
    expect(watch.watched).toEqual([
      [at('schemas'), at('src', 'blog'), at('src', 'checkout'), at('src', 'shop')],
    ])

    watch.fire(at('schemas', 'shop.json'))
    await vi.advanceTimersByTimeAsync(50)
    expect(generate).toHaveBeenCalledTimes(6)
    watch.fire(at('ignored.json'))
    await vi.advanceTimersByTimeAsync(50)
    expect(generate).toHaveBeenCalledTimes(6)
    plugin.close()
  })

  it('tells .groq files and the schemas apart from generated output', () => {
    const schemas = new Set([at('schema.json'), at('shop', 'schema.json')])
    expect(shouldRegenerate(at('posts.groq'), schemas)).toBe(true)
    expect(shouldRegenerate(at('schema.json'), schemas)).toBe(true)
    expect(shouldRegenerate(at('shop', 'schema.json'), schemas)).toBe(true)
    expect(shouldRegenerate(at('posts.d.groq.ts'), schemas)).toBe(false)
    expect(shouldRegenerate(at('other', 'schema.json'), schemas)).toBe(false)
    expect(shouldRegenerate(at('notes.json'), schemas)).toBe(false)
  })
})

describe('typescript plugin with the real file watcher', () => {
  it('writes declarations on start and when a .groq file is saved', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-ts-plugin-'))
    await writeFile(join(directory, 'schema.json'), await readFile(SCHEMA))
    await mkdir(join(directory, 'queries'))
    await writeFile(join(directory, 'queries', 'posts.groq'), '*[_type == "post"]{title, role}\n')
    const plugin = startGroqTypeScriptPlugin({directory})
    try {
      await waitFor(join(directory, 'queries', 'posts.d.groq.ts'))
      await writeFile(join(directory, 'queries', 'authors.groq'), '*[_type == "author"]{name}\n')
      await waitFor(join(directory, 'queries', 'authors.d.groq.ts'))
      const text = await readFile(join(directory, 'queries', 'authors.d.groq.ts'), 'utf8')
      expect(text).toContain('export default query')
    } finally {
      plugin.close()
    }
  }, 15_000)
})

describe('typescript-plugin.cjs', () => {
  it('passes resources through and drops malformed entries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-ts-cjs-resources-'))
    await mkdir(join(directory, 'blog'))
    await mkdir(join(directory, 'shop'))
    await writeFile(join(directory, 'blog', 'schema.json'), await readFile(SCHEMA))
    await writeFile(
      join(directory, 'shop', 'schema.json'),
      JSON.stringify([
        {
          attributes: {
            _type: {type: 'objectAttribute', value: {type: 'string', value: 'product'}},
            sku: {type: 'objectAttribute', value: {type: 'string'}},
          },
          name: 'product',
          type: 'document',
        },
      ]),
    )
    await writeFile(join(directory, 'blog', 'posts.groq'), '*[_type == "post"]{title, role}\n')
    await writeFile(join(directory, 'shop', 'products.groq'), '*[_type == "product"]{sku}\n')
    await writeFile(join(directory, 'outside.groq'), '*\n')
    const init = require('../../typescript-plugin.cjs') as (modules: unknown) => {
      create(info: unknown): {dispose(): void}
    }
    const proxy = init({}).create({
      config: {
        resources: [
          {path: 'blog', schema: 'blog/schema.json'},
          {path: ['shop'], schema: 'shop/schema.json'},
          'nope',
          {path: 'shop'},
          {path: [], schema: 'shop/schema.json'},
        ],
      },
      languageService: {},
      project: {getCurrentDirectory: () => directory},
    })
    try {
      await waitFor(join(directory, 'blog', 'posts.d.groq.ts'))
      await waitFor(join(directory, 'shop', 'products.d.groq.ts'))
      expect(await readFile(join(directory, 'blog', 'posts.d.groq.ts'), 'utf8')).toContain(
        'role: "admin" | "member"',
      )
      expect(await readFile(join(directory, 'shop', 'products.d.groq.ts'), 'utf8')).toContain(
        'sku: string',
      )
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(await readdir(directory)).not.toContain('outside.d.groq.ts')
    } finally {
      proxy.dispose()
    }
  }, 15_000)

  it('creates one session per project and ends it with the language service', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-ts-cjs-'))
    await writeFile(join(directory, 'schema.json'), await readFile(SCHEMA))
    await writeFile(join(directory, 'posts.groq'), '*[_type == "post"]{title}\n')
    const init = require('../../typescript-plugin.cjs') as (modules: unknown) => {
      create(info: unknown): {dispose(): void; getProgram(): string}
    }
    const logs: string[] = []
    const dispose = vi.fn()
    const service = {
      dispose,
      getProgram() {
        return 'program'
      },
      version: 1,
    }
    const info = {
      config: {schema: 'schema.json'},
      languageService: service,
      project: {
        getCurrentDirectory: () => directory,
        projectService: {
          logger: {
            info(message: string) {
              logs.push(message)
            },
          },
        },
      },
    }

    const proxy = init({}).create(info)
    expect(proxy.getProgram()).toBe('program')
    expect((proxy as unknown as {version: number}).version).toBe(1)
    await waitFor(join(directory, 'posts.d.groq.ts'))

    proxy.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
    await writeFile(join(directory, 'late.groq'), '*[_type == "post"]{title}\n')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(await readdir(directory)).not.toContain('late.d.groq.ts')
    expect(logs).toEqual([])

    // Disposing before the ESM import settles must not leave a session behind.
    const early = await mkdtemp(join(tmpdir(), 'groq-ts-cjs-early-'))
    await writeFile(join(early, 'posts.groq'), '*[_type == "post"]{title}\n')
    const earlyProxy = init({}).create({
      ...info,
      config: {},
      project: {getCurrentDirectory: () => early},
    })
    earlyProxy.dispose()
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(await readdir(early)).toEqual(['posts.groq'])
  }, 15_000)
})

async function waitFor(file: string): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 10_000) {
    try {
      await stat(file)
      return
    } catch {
      await new Promise((resolve) => {
        setTimeout(resolve, 40)
      })
    }
  }
  throw new Error(`Timed out waiting for ${file}`)
}

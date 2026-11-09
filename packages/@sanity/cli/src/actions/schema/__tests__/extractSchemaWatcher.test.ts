import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {type Output} from '@sanity/cli-core'
import {afterAll, afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {startExtractSchemaWatcher} from '../extractSchemaWatcher.js'

// Asserts what reaches chokidar, which is where the glob bug was: patterns were handed over
// verbatim and chokidar 4 and later do not expand them. The integration suite proves the end to
// end behavior; these pin the pattern shapes cheaply.

const mockWatch = vi.hoisted(() => vi.fn())
const mockStudioWorkerTask = vi.hoisted(() => vi.fn())

vi.mock(import('chokidar'), async (importOriginal) => ({
  ...(await importOriginal()),
  watch: mockWatch,
}))

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

const workDir = mkdtempSync(path.join(tmpdir(), 'extract-schema-watcher-'))
mkdirSync(path.join(workDir, 'schemaTypes'), {recursive: true})
mkdirSync(path.join(workDir, 'lib'), {recursive: true})
writeFileSync(path.join(workDir, 'sanity.config.ts'), 'export default {}')

const inProject = (...segments: string[]) => path.join(workDir, ...segments)
const output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output

async function start(watchPatterns: string[], outputPath = inProject('schema.json')) {
  return startExtractSchemaWatcher({
    extractOptions: {
      configPath: inProject('sanity.config.ts'),
      enforceRequiredFields: false,
      format: 'groq-type-nodes',
      outputPath,
      watchPatterns,
      workspace: undefined,
    },
    output,
    watchPatterns,
  })
}

const watchedRoots = () => mockWatch.mock.calls[0][0] as string[]
const ignored = () => mockWatch.mock.calls[0][1].ignored as (filePath: string) => boolean

describe('extractSchemaWatcher', () => {
  beforeEach(() => {
    mockWatch.mockReturnValue({close: vi.fn(), on: vi.fn()})
    mockStudioWorkerTask.mockResolvedValue({schema: [], type: 'success'})
  })

  afterEach(() => vi.clearAllMocks())
  afterAll(() => rmSync(workDir, {force: true, recursive: true}))

  describe('watch roots', () => {
    test('reduces a glob to its static base directory', async () => {
      await start(['schema*/**/*.{js,ts}'])
      expect(watchedRoots()).toEqual([workDir])
    })

    test('uses the named directory when a pattern has a static prefix', async () => {
      await start(['lib/**/*.ts'])
      expect(watchedRoots()).toEqual([inProject('lib')])
    })

    test('deduplicates roots shared by several patterns', async () => {
      await start(['schemaTypes/**/*.ts', 'schemaTypes/**/*.tsx'])
      expect(watchedRoots()).toEqual([inProject('schemaTypes')])
    })

    test('keeps a nested base separate, since chokidar is given directories', async () => {
      await start(['schemaTypes/**/*.ts', 'schemaTypes/nested/**/*.ts'])
      expect(watchedRoots()).toEqual([inProject('schemaTypes'), inProject('schemaTypes/nested')])
    })

    test('resolves an absolute pattern back under the work directory', async () => {
      await start([inProject('schemaTypes', '**', '*.ts')])
      expect(watchedRoots()).toEqual([inProject('schemaTypes')])
    })

    test('treats a bare directory name as everything inside it', async () => {
      await start(['schemaTypes'])
      expect(watchedRoots()).toEqual([inProject('schemaTypes')])
    })
  })

  describe('ignored', () => {
    test('skips build and dependency directories', async () => {
      await start(['schema*/**/*.ts'])
      expect(ignored()(inProject('node_modules'))).toBe(true)
      expect(ignored()(inProject('.git'))).toBe(true)
      expect(ignored()(inProject('src', 'dist'))).toBe(true)
      expect(ignored()(inProject('.next'))).toBe(true)
      expect(ignored()(inProject('schemaTypes', 'post.ts'))).toBe(false)
    })

    test('does not skip a directory a watch pattern names', async () => {
      // `sanity schema extract --watch --watch-patterns "lib/**/*.ts"` is a documented example,
      // and `lib` is otherwise skipped.
      await start(['lib/**/*.ts'])
      expect(ignored()(inProject('lib'))).toBe(false)
      expect(ignored()(inProject('schemaTypes', 'lib'))).toBe(true)
    })

    test('skips the file the extraction writes', async () => {
      // Otherwise each extraction writes the output, the write matches, and it runs forever.
      await start(['src/**/*.ts'], inProject('src', 'schema.json'))
      expect(ignored()(inProject('src', 'schema.json'))).toBe(true)
      expect(ignored()(inProject('src', 'queries.ts'))).toBe(false)
    })
  })
})

import {join} from 'node:path'
import {pathToFileURL} from 'node:url'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {createStudioWorker, studioWorkerTask} from '../studioWorkerTask.js'

const mockPromisifyWorker = vi.hoisted(() => vi.fn())
const mockWorkerConstructor = vi.hoisted(() => vi.fn())

vi.mock('../../../util/promisifyWorker.js', () => ({
  promisifyWorker: mockPromisifyWorker,
}))

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:worker_threads')>()
  return {
    ...actual,
    Worker: function Worker(filePath: unknown, options?: unknown) {
      mockWorkerConstructor(filePath, options)
      return {}
    },
  }
})

// Build file URLs from real absolute paths: on Windows, fileURLToPath() throws
// ERR_INVALID_FILE_URL_PATH for drive-letter-less URLs like file:///studio/….
const STUDIO_ROOT = join(process.cwd(), 'studio')
const TASK_FILE_URL = pathToFileURL(join(STUDIO_ROOT, 'task.worker.js'))
const NON_WORKER_FILE_URL = pathToFileURL(join(STUDIO_ROOT, 'task.js'))

describe('studioWorkerTask', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('marks the worker as one-shot so the loader closes its Vite server', async () => {
    mockPromisifyWorker.mockResolvedValue('result')

    await studioWorkerTask(TASK_FILE_URL, {name: 'test', studioRootPath: STUDIO_ROOT})

    expect(mockPromisifyWorker).toHaveBeenCalledWith(
      expect.objectContaining({href: expect.stringContaining('studioWorkerLoader.worker.js')}),
      expect.objectContaining({
        env: expect.objectContaining({
          STUDIO_WORKER_ONE_SHOT: '1',
          STUDIO_WORKER_STUDIO_ROOT_PATH: STUDIO_ROOT,
          STUDIO_WORKER_TASK_FILE: expect.stringContaining('task.worker.js'),
        }),
      }),
    )
  })

  test('rejects file paths without a .worker suffix', () => {
    expect(() =>
      studioWorkerTask(NON_WORKER_FILE_URL, {
        name: 'test',
        studioRootPath: STUDIO_ROOT,
      }),
    ).toThrow('Studio worker tasks must include `.worker.(js|ts)` in path')
  })
})

describe('createStudioWorker', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('does not mark long-lived workers as one-shot', () => {
    createStudioWorker(TASK_FILE_URL, {name: 'test', studioRootPath: STUDIO_ROOT})

    expect(mockWorkerConstructor).toHaveBeenCalledWith(
      expect.objectContaining({href: expect.stringContaining('studioWorkerLoader.worker.js')}),
      expect.objectContaining({
        env: expect.not.objectContaining({STUDIO_WORKER_ONE_SHOT: expect.anything()}),
      }),
    )
  })
})

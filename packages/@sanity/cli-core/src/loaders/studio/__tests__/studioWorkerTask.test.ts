import {fileURLToPath} from 'node:url'

import {afterEach, describe, expect, test, vi} from 'vitest'

import {createStudioWorker, studioWorkerTask} from '../studioWorkerTask.js'

const mockPromisifyWorker = vi.hoisted(() => vi.fn())
const mockWorker = vi.hoisted(() =>
  vi.fn(function MockWorker() {
    return {}
  }),
)

vi.mock(import('../../../util/promisifyWorker.js'), () => ({
  promisifyWorker: mockPromisifyWorker,
}))

vi.mock('node:worker_threads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:worker_threads')>()),
  Worker: mockWorker,
}))

const INVALID_TASK_URL = new URL('example.ts', import.meta.url)
const TASK_URL = new URL('example.worker.ts', import.meta.url)
const TASK_PATH = fileURLToPath(TASK_URL)

describe('studioWorkerTask', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('marks the worker as one-shot and disables forced termination', async () => {
    mockPromisifyWorker.mockResolvedValue({type: 'success'})

    await studioWorkerTask(TASK_URL, {
      env: {CUSTOM_ENV: 'value'},
      name: 'example',
      studioRootPath: '/studio',
      timeout: 10_000,
      workerData: {input: true},
    })

    expect(mockPromisifyWorker).toHaveBeenCalledWith(
      expect.objectContaining({pathname: expect.stringContaining('studioWorkerLoader.worker.js')}),
      {
        env: {
          CUSTOM_ENV: 'value',
          STUDIO_WORKER_ONE_SHOT: '1',
          STUDIO_WORKER_STUDIO_ROOT_PATH: '/studio',
          STUDIO_WORKER_TASK_FILE: TASK_PATH,
        },
        name: 'example',
        terminateOnSettle: false,
        timeout: 10_000,
        workerData: {input: true},
      },
    )
  })

  test('returns ordinary task messages', async () => {
    const result = {type: 'success', value: 42}
    mockPromisifyWorker.mockResolvedValue(result)

    await expect(
      studioWorkerTask(TASK_URL, {name: 'example', studioRootPath: '/studio'}),
    ).resolves.toBe(result)
  })

  test('rejects with serialized loader errors and preserves their cause', async () => {
    mockPromisifyWorker.mockResolvedValue({
      error: {
        message: 'Invalid studio config',
        name: 'TypeError',
        stack: 'TypeError: Invalid studio config',
      },
      type: 'sanity.studioWorker.error',
    })

    const promise = studioWorkerTask(TASK_URL, {name: 'example', studioRootPath: '/studio'})

    await expect(promise).rejects.toMatchObject({
      cause: expect.objectContaining({
        message: 'Invalid studio config',
        name: 'TypeError',
        stack: 'TypeError: Invalid studio config',
      }),
      message: 'Worker error: Invalid studio config',
    })
  })

  test('validates the task file name before creating a worker', () => {
    expect(() =>
      studioWorkerTask(INVALID_TASK_URL, {
        name: 'example',
        studioRootPath: '/studio',
      }),
    ).toThrow('Studio worker tasks must include `.worker.(js|ts)` in path')
    expect(mockPromisifyWorker).not.toHaveBeenCalled()
  })
})

describe('createStudioWorker', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test('does not mark long-lived workers as one-shot', () => {
    createStudioWorker(TASK_URL, {
      env: {CUSTOM_ENV: 'value'},
      name: 'example',
      studioRootPath: '/studio',
      workerData: {input: true},
    })

    expect(mockWorker).toHaveBeenCalledWith(
      expect.objectContaining({pathname: expect.stringContaining('studioWorkerLoader.worker.js')}),
      {
        env: {
          CUSTOM_ENV: 'value',
          STUDIO_WORKER_STUDIO_ROOT_PATH: '/studio',
          STUDIO_WORKER_TASK_FILE: TASK_PATH,
        },
        name: 'example',
        studioRootPath: '/studio',
        workerData: {input: true},
      },
    )
  })

  test('validates the task file name before creating a worker', () => {
    expect(() =>
      createStudioWorker(INVALID_TASK_URL, {
        name: 'example',
        studioRootPath: '/studio',
      }),
    ).toThrow('Studio worker tasks must include `.worker.(js|ts)` in path')
    expect(mockWorker).not.toHaveBeenCalled()
  })
})

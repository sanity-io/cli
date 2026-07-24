import {fileURLToPath} from 'node:url'
import {Worker, type WorkerOptions} from 'node:worker_threads'

import {type RequireProps} from '../../types.js'
import {isRecord} from '../../util/isRecord.js'
import {jitToolchainExecArgv} from '../../util/jitToolchainExecArgv.js'
import {promisifyWorker} from '../../util/promisifyWorker.js'
import {
  deserializeStudioWorkerError,
  isStudioWorkerErrorMessage,
  type StudioWorkerErrorMessage,
} from './studioWorkerLifecycle.js'

/**
 * Options for the studio worker task
 *
 * @internal
 */
interface StudioWorkerTaskOptions extends RequireProps<WorkerOptions, 'name'> {
  studioRootPath: string

  /** Optional timeout in milliseconds. If the worker does not respond within this time, the promise is rejected. */
  timeout?: number
}

/**
 * Executes a worker file in a Sanity Studio browser context.
 *
 * This uses a combination of vite for "bundling" + jsdom for emulating a browser
 * environment under the hood, which means that the same thing that will work in vite
 * _should_ work in the worker - to a degree. If the user has defined any typescript
 * path aliases, these will have to be added as aliases to the vite config - the same
 * behavior as you would see with regular vite. Other things that are accounted for:
 *
 * - TypeScript support (+JSX, enums and other "compilation needed" features)
 * - CSS, font and other file imports will resolve to a file path
 * - CSS module imports will resolve to a javascript object of class names
 * - Environment variables are available both as `import.meta.env` and `process.env`,
 *   and `.env` files are loaded in the same way that they would in a Sanity studio.
 * - Browser globals not available in a Node.js environment but _are_ provided by JSDOM
 *   are defined directly to the Node environment as globals. While this polutes the
 *   global namespace, it is done only in the worker thread.
 * - Certain browser globals that are _not_ available in JSDOM are also provided to the
 *   global namespace - things like `requestIdleCallback`, `IntersectionObserver` etc.
 *   These are provided with a minimal stub implementation to make them not crash.
 *
 * @param filePath - Path to the worker file (`.ts` works and is encouraged)
 * @param options - Options to pass to the worker
 * @returns A promise that resolves with the message from the worker
 * @throws If the file does not exist
 * @throws If the worker exits with a non-zero code
 * @internal
 */
export function studioWorkerTask<T = unknown>(
  filePath: URL,
  options: StudioWorkerTaskOptions,
): Promise<T> {
  const normalizedFilePath = fileURLToPath(filePath)

  if (!/\.worker\.(js|ts)$/.test(normalizedFilePath)) {
    throw new Error('Studio worker tasks must include `.worker.(js|ts)` in path')
  }

  const {studioRootPath, timeout, ...workerOptions} = options
  const workerPromise = promisifyWorker<StudioWorkerErrorMessage | T>(
    new URL('studioWorkerLoader.worker.js', import.meta.url),
    {
      ...workerOptions,
      env: {
        ...(isRecord(workerOptions.env) ? workerOptions.env : process.env),
        // Tasks spawned here are one-shot: the loader closes its Vite
        // (rolldown) server before any message reaches the main thread, so
        // teardown can never race rolldown's native threads (SIGABRT on
        // macOS). Long-lived workers (`createStudioWorker`) must NOT set it.
        STUDIO_WORKER_ONE_SHOT: '1',
        STUDIO_WORKER_STUDIO_ROOT_PATH: studioRootPath,
        STUDIO_WORKER_TASK_FILE: normalizedFilePath,
      },
      // Never terminate() a worker hosting rolldown's native threads — let it
      // exit on its own (it closes its server first) or tear down with the
      // process.
      terminateOnSettle: false,
      timeout,
    },
  )

  return workerPromise.then((result) => {
    if (isStudioWorkerErrorMessage(result)) {
      throw deserializeStudioWorkerError(result)
    }

    return result
  })
}

/**
 * Creates a new worker for a studio worker task.
 *
 * This uses a combination of vite for "bundling" + jsdom for emulating a browser
 * environment under the hood, which means that the same thing that will work in vite
 * _should_ work in the worker - to a degree. If the user has defined any typescript
 * path aliases, these will have to be added as aliases to the vite config - the same
 * behavior as you would see with regular vite. Other things that are accounted for:
 *
 * - TypeScript support (+JSX, enums and other "compilation needed" features)
 * - CSS, font and other file imports will resolve to a file path
 * - CSS module imports will resolve to a javascript object of class names
 * - Environment variables are available both as `import.meta.env` and `process.env`,
 *   and `.env` files are loaded in the same way that they would in a Sanity studio.
 * - Browser globals not available in a Node.js environment but _are_ provided by JSDOM
 *   are defined directly to the Node environment as globals. While this polutes the
 *   global namespace, it is done only in the worker thread.
 * - Certain browser globals that are _not_ available in JSDOM are also provided to the
 *   global namespace - things like `requestIdleCallback`, `IntersectionObserver` etc.
 *   These are provided with a minimal stub implementation to make them not crash.
 *
 * @param filePath - Path to the worker file (`.ts` works and is encouraged)
 * @param options - Options to pass to the worker
 * @returns A promise that resolves with the message from the worker
 * @throws If the file does not exist
 * @throws If the worker exits with a non-zero code
 * @internal
 */
export function createStudioWorker(filePath: URL, options: StudioWorkerTaskOptions) {
  const normalizedFilePath = fileURLToPath(filePath)

  if (!/\.worker\.(js|ts)$/.test(normalizedFilePath)) {
    throw new Error('Studio worker tasks must include `.worker.(js|ts)` in path')
  }

  return new Worker(new URL('studioWorkerLoader.worker.js', import.meta.url), {
    execArgv: jitToolchainExecArgv(),
    ...options,
    env: {
      ...(isRecord(options.env) ? options.env : process.env),
      STUDIO_WORKER_STUDIO_ROOT_PATH: options.studioRootPath,
      STUDIO_WORKER_TASK_FILE: normalizedFilePath,
    },
  })
}

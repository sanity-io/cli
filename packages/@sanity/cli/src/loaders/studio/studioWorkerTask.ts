import {existsSync} from 'node:fs'
import {resolve as resolvePath} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Worker, type WorkerOptions} from 'node:worker_threads'

import type {RequireProps} from '../../typeHelpers.js'

import {isRecord} from '../../util/isRecord.js'

/**
 * Options for the studio worker task
 *
 * @internal
 */
export interface StudioWorkerTaskOptions extends RequireProps<WorkerOptions, 'name'> {
  studioRootPath: string
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
export function studioWorkerTask(
  filePath: string,
  options: StudioWorkerTaskOptions,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!/\.worker\.(js|ts)$/.test(filePath)) {
      throw new Error('Studio worker tasks must include `.worker.(js|ts)` in path')
    }

    let workerLoaderPath = resolvePath(import.meta.dirname, 'studioWorkerLoader.js')
    const workerLoaderPathTs = workerLoaderPath.replace(/\.js$/, '.ts')

    const execArgv = [...(options.execArgv || [])]
    if (existsSync(workerLoaderPathTs)) {
      // Running from uncompiled/development mode, load the ts version
      workerLoaderPath = workerLoaderPathTs
      execArgv.push('--import', fileURLToPath(import.meta.resolve('ts-blank-space/register')))
    }

    const worker = new Worker(workerLoaderPath, {
      ...options,
      env: {
        ...(isRecord(options.env) ? options.env : process.env),
        STUDIO_WORKER_STUDIO_ROOT_PATH: options.studioRootPath,
        STUDIO_WORKER_TASK_FILE: filePath,
      },
      execArgv,
    })

    worker.addListener('error', function onWorkerError(err) {
      reject(new Error(`Fail to load file through worker: ${err.message}`))
      cleanup()
    })
    worker.addListener('exit', function onWorkerExit(code) {
      if (code > 0) {
        reject(new Error(`Worker exited with code ${code}`))
      }
    })
    worker.addListener('messageerror', function onWorkerMessageError(err) {
      reject(new Error(`Fail to parse message from worker: ${err}`))
      cleanup()
    })
    worker.addListener('message', function onWorkerMessage(message) {
      resolve(message)
      cleanup()
    })

    function cleanup() {
      // Allow the worker a _bit_ of time to clean up, but ensure that we don't have
      // lingering processes hanging around forever if the worker doesn't exit on its
      // own.
      setImmediate(() => worker.terminate())
    }
  })
}

import {existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {URL} from 'node:url'
import {Worker, type WorkerOptions} from 'node:worker_threads'

import {getTsconfig} from 'get-tsconfig'

import {type RequireProps} from '../../typeHelpers.js'
import {isRecord} from '../../util/isRecord.js'

/**
 * Options for the tsx worker task
 *
 * @internal
 */
interface TsxWorkerTaskOptions extends RequireProps<WorkerOptions, 'name'> {
  rootPath: string
}

/**
 * Executes a worker file with tsx registered. This means you can import other
 * typescript with fairly rich syntax, and still have that only apply to the worker
 * thread instead of the full parent process. The worker should emit a message when
 * complete using `parentPort`. Once it has received a single message will resolve the
 * returned promise with that message. If you are expecting multiple messages, you will
 * have to implement another method ;)
 *
 * @param filePath - Path to the worker file
 * @param options - Options to pass to the worker
 * @returns A promise that resolves with the message from the worker
 * @throws If the file does not exist
 * @throws If the worker exits with a non-zero code
 * @internal
 */
export function tsxWorkerTask<T = unknown>(
  filePath: URL,
  options: TsxWorkerTaskOptions,
): Promise<T> {
  const tsconfig = getTsconfig(options.rootPath)

  const env = {
    ...(isRecord(options.env) ? options.env : process.env),
    ...(tsconfig?.path ? {TSX_TSCONFIG_PATH: tsconfig.path} : {}),
    TSX_WORKER_TASK_SCRIPT: filePath.pathname,
  }

  let workerLoaderPath = new URL('tsxWorkerLoader.worker.js', import.meta.url).pathname
  const workerLoaderPathTs = workerLoaderPath.replace(/\.js$/, '.ts')

  const execArgv = [...(options.execArgv || [])]
  if (existsSync(workerLoaderPathTs)) {
    // Running from uncompiled/development mode, load the ts version
    workerLoaderPath = workerLoaderPathTs
    const require = createRequire(import.meta.url)
    execArgv.push('--import', require.resolve('ts-blank-space/register'))
  }

  const worker = new Worker(workerLoaderPath, {
    ...options,
    env,
    execArgv,
  })

  return new Promise((resolve, reject) => {
    worker.addListener('error', function onWorkerError(err) {
      reject(new Error(`Failed to load file through worker: ${err.message}`, {cause: err}))
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

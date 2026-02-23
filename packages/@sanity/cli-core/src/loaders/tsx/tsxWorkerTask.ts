import {fileURLToPath, URL} from 'node:url'
import {Worker, type WorkerOptions} from 'node:worker_threads'

import {getTsconfig} from 'get-tsconfig'

import {type RequireProps} from '../../types.js'
import {isRecord} from '../../util/isRecord.js'
import {promisifyWorker} from '../../util/promisifyWorker.js'

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
    TSX_WORKER_TASK_SCRIPT: fileURLToPath(filePath),
  }

  const worker = new Worker(new URL('tsxWorkerLoader.worker.js', import.meta.url), {
    ...options,
    env,
  })

  return promisifyWorker<T>(worker)
}

import {Worker, type WorkerOptions} from 'node:worker_threads'

import {subdebug} from '../_exports/debug.js'
import {jitToolchainExecArgv} from './jitToolchainExecArgv.js'

const debug = subdebug('promisifyWorker')

function onDetachedWorkerError(err: Error) {
  debug(`Detached worker error: ${err.message}`, err)
}

interface PromisifyWorkerOptions extends WorkerOptions {
  /**
   * Whether to forcibly terminate the worker after settling. Disable this for
   * workers that host native addons (e.g. rolldown via Vite 8) whose threads
   * must tear down with the process: terminating such a worker while native
   * threads are live can abort the whole process with a silent SIGABRT. A
   * disabled worker is unrefed and may continue running until the process
   * exits, including after a timeout.
   */
  terminateOnSettle?: boolean

  /** Optional timeout in milliseconds. If the worker does not respond within this time, the promise is rejected. */
  timeout?: number
}

/**
 * Creates a Node.js Worker from the given file path and options, and wraps it
 * in a Promise that resolves with the first message the worker sends, and
 * rejects on error, message deserialization failure, or non-zero exit code.
 * By default, the worker is terminated after a message or error is received.
 * Callers can instead unref it and allow natural process teardown.
 *
 * @param filePath - URL to the worker file
 * @param options - Options to pass to the Worker constructor
 * @returns A promise that resolves with the first message from the worker
 * @throws If the worker emits an error, a message deserialization error, or exits with a non-zero code
 * @internal
 */
export function promisifyWorker<T = unknown>(
  filePath: URL,
  options?: PromisifyWorkerOptions,
): Promise<T> {
  const {terminateOnSettle = true, timeout, ...workerOptions} = options ?? {}
  if (!workerOptions.execArgv) {
    workerOptions.execArgv = jitToolchainExecArgv()
  }
  const worker = new Worker(filePath, workerOptions)

  const fileName = `[${filePath.pathname}]`

  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    if (timeout !== undefined && timeout > 0) {
      timeoutId = setTimeout(() => {
        settled = true
        reject(new Error(`Worker timed out after ${timeout}ms`))
        cleanup(false)
      }, timeout)
    }

    worker.addListener('error', function onWorkerError(err) {
      settled = true
      clearTimeout(timeoutId)
      debug(`Worker error: ${err.message}`, err)
      reject(new Error(`Worker error: ${err.message}`, {cause: err}))
      cleanup()
    })
    // No cleanup() here — the worker is already dead after exiting,
    // so there is nothing to terminate or remove listeners from.
    worker.addListener('exit', function onWorkerExit(code) {
      clearTimeout(timeoutId)
      if (code > 0) {
        debug(`${fileName} exited with code ${code}`)
        reject(new Error(`Worker exited with code ${code}`))
      } else if (!settled) {
        debug(`${fileName} exited with code 0 without sending a message`)
        reject(new Error('Worker exited without sending a message'))
      }
    })
    worker.addListener('messageerror', function onWorkerMessageError(err) {
      settled = true
      clearTimeout(timeoutId)
      debug(`${fileName} message error: ${err.message}`, err)
      reject(new Error(`Failed to deserialize worker message: ${err}`))
      cleanup()
    })
    worker.addListener('message', function onWorkerMessage(message) {
      settled = true
      clearTimeout(timeoutId)
      debug(`${fileName} message %o`, message)
      resolve(message)
      cleanup()
    })

    function cleanup(deferTermination = true) {
      if (terminateOnSettle) {
        if (deferTermination) {
          setImmediate(() => void worker.terminate())
        } else {
          void worker.terminate()
        }
        worker.removeAllListeners()
        return
      }

      worker.unref()
      worker.removeAllListeners()
      // A detached worker may still fail before process teardown. Keep an error
      // listener so EventEmitter does not rethrow it in the parent process.
      worker.addListener('error', onDetachedWorkerError)
    }
  })
}

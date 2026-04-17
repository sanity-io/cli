import {Worker, type WorkerOptions} from 'node:worker_threads'

import {subdebug} from '../debug.js'

const debug = subdebug('promisifyWorker')

interface PromisifyWorkerOptions extends WorkerOptions {
  /** Optional timeout in milliseconds. If the worker does not respond within this time, it will be terminated and the promise rejected. */
  timeout?: number
}

/**
 * Creates a Node.js Worker from the given file path and options, and wraps it
 * in a Promise that resolves with the first message the worker sends, and
 * rejects on error, message deserialization failure, or non-zero exit code.
 * The worker is terminated after a message or error is received.
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
  const {timeout, ...workerOptions} = options ?? {}
  const worker = new Worker(filePath, workerOptions)

  const fileName = `[${filePath.pathname}]`

  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    if (timeout !== undefined && timeout > 0) {
      timeoutId = setTimeout(() => {
        settled = true
        reject(new Error(`Worker timed out after ${timeout}ms`))
        void worker.terminate()
        worker.removeAllListeners()
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

    function cleanup() {
      // Unref first so the parent process can exit immediately without
      // waiting for the worker thread to finish shutting down.
      worker.unref()
      worker.removeAllListeners()

      // Schedule a deferred terminate() as a safety net to force-kill
      // workers that don't exit on their own (e.g. native addons holding
      // handles). The timer is unref'd so it won't keep the process alive
      // — it only fires if the process is still running for other reasons.
      //
      // We avoid calling terminate() synchronously because it creates an
      // internal ref'd MessagePort that would keep the parent process alive
      // if the worker is slow to respond (e.g. Rolldown in Vite 8).
      const terminateTimer = setTimeout(() => void worker.terminate(), 5000)
      terminateTimer.unref()
    }
  })
}

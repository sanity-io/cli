import {Worker} from 'node:worker_threads'

import {subdebug} from '../debug.js'

const debug = subdebug('promisifyWorker')

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
export function promisifyWorker<T = unknown>(filePath: URL, options?: WorkerOptions): Promise<T> {
  const worker = new Worker(filePath, options)

  const fileName = `[${filePath.pathname}]`

  return new Promise<T>((resolve, reject) => {
    let settled = false

    worker.addListener('error', function onWorkerError(err) {
      settled = true
      debug(`Worker error: ${err.message}`, err)
      reject(new Error(`Worker error: ${err.message}`, {cause: err}))
      cleanup()
    })
    // No cleanup() here — the worker is already dead after exiting,
    // so there is nothing to terminate or remove listeners from.
    worker.addListener('exit', function onWorkerExit(code) {
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
      debug(`${fileName} message error: ${err.message}`, err)
      reject(new Error(`Failed to deserialize worker message: ${err}`))
      cleanup()
    })
    worker.addListener('message', function onWorkerMessage(message) {
      settled = true
      debug(`${fileName} message %o`, message)
      resolve(message)
      cleanup()
    })

    function cleanup() {
      setImmediate(() => worker.terminate())
      worker.removeAllListeners()
    }
  })
}
